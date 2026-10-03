/**
 * Ruth's tools. Results are typed with contract schemas, so the agent can turn
 * them into message parts without re-parsing. Tool failures are returned to the
 * model (`failureMode: "return"`) so Ruth can recover instead of aborting the turn.
 */
import {
  Approval,
  ApprovalId,
  ArtifactId,
  type ArtifactKind,
  ChunkId,
  ChunkLocation,
  type Citation,
  FileAction,
  ItemId,
  type MessagePart,
  ThreadId,
  type UserId,
} from "@avenire/contracts";
import { Sandboxes } from "@avenire/cloud/sandbox";
import { Database } from "@avenire/database/client";
import { artifact, chunk, item, ruthApproval } from "@avenire/database/schema";
import { Retrieval } from "@avenire/ingestion/retrieval";
import { newId } from "@avenire/shared/id";
import { artifactKey } from "@avenire/storage/keys";
import { Storage } from "@avenire/storage/storage";
import { and, asc, eq, gte } from "drizzle-orm";
import type * as Response from "effect/ai/Response";
import * as Tool from "effect/ai/Tool";
import * as Toolkit from "effect/ai/Toolkit";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

/** The user and thread a turn runs for; provided per turn so tools stay pure. */
export class RuthTurn extends Context.Service<
  RuthTurn,
  { readonly userId: UserId; readonly threadId: ThreadId }
>()("avenire/ai/RuthTurn") {}

const ChunkResult = Schema.Struct({
  chunkId: ChunkId,
  itemId: ItemId,
  title: Schema.String,
  location: ChunkLocation,
  content: Schema.String,
});

const ArtifactRef = Schema.Struct({ artifactId: ArtifactId, title: Schema.String });

const toolOptions = { failure: Schema.String, failureMode: "return" } as const;

const SearchMaterials = Tool.make("search_materials", {
  description: "Search the user's own study material. Always do this before explaining a concept.",
  parameters: Schema.Struct({ query: Schema.NonEmptyString, limit: Schema.optional(Schema.Int) }),
  success: Schema.Array(ChunkResult),
  dependencies: [RuthTurn, Retrieval],
  ...toolOptions,
});

const ReadItem = Tool.make("read_item", {
  description: "Read consecutive chunks of one item, e.g. to see the context around a search hit.",
  parameters: Schema.Struct({
    itemId: ItemId,
    fromOrdinal: Schema.optional(Schema.Int),
    count: Schema.optional(Schema.Int),
  }),
  success: Schema.Array(ChunkResult),
  dependencies: [RuthTurn, Database],
  ...toolOptions,
});

const RunPython = Tool.make("run_python", {
  description: "Run Python in a sandbox for computation and matplotlib plots.",
  parameters: Schema.Struct({
    code: Schema.String,
    packages: Schema.optional(Schema.Array(Schema.String)),
  }),
  success: Schema.Struct({
    code: Schema.String,
    stdout: Schema.String,
    plots: Schema.Array(ArtifactRef),
  }),
  dependencies: [RuthTurn, Sandboxes, Storage, Database, Crypto.Crypto],
  ...toolOptions,
});

const RenderManim = Tool.make("render_manim", {
  description: "Render a Manim scene to a short explanatory video.",
  parameters: Schema.Struct({
    code: Schema.String,
    sceneName: Schema.String,
    quality: Schema.optional(Schema.Literals(["l", "m", "h", "k"])),
  }),
  success: ArtifactRef,
  dependencies: [RuthTurn, Sandboxes, Storage, Database, Crypto.Crypto],
  ...toolOptions,
});

const ShowWidget = Tool.make("show_widget", {
  description:
    "Show a self-contained interactive HTML widget (inline CSS/JS only, no network access).",
  parameters: Schema.Struct({ title: Schema.String, html: Schema.String }),
  success: Schema.Struct({ title: Schema.String, html: Schema.String }),
  ...toolOptions,
});

const ProposeFileAction = Tool.make("propose_file_action", {
  description:
    "Ask the user to approve a change to their files. This never performs the change itself.",
  parameters: Schema.Struct({ action: FileAction }),
  success: Approval,
  dependencies: [RuthTurn, Database, Crypto.Crypto],
  ...toolOptions,
});

export const RuthToolkit = Toolkit.make(
  SearchMaterials,
  ReadItem,
  RunPython,
  RenderManim,
  ShowWidget,
  ProposeFileAction,
);

export type RuthToolResult = Response.ToolResultParts<typeof RuthToolkit.tools>;

const WIDGET_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/<script\b[^>]*\bsrc\s*=/i, "External scripts are not allowed"],
  [/<form\b/i, "Forms are not allowed"],
  [/\bfetch\s*\(/i, "Network fetch is not allowed"],
  [/XMLHttpRequest|WebSocket|EventSource/i, "Network APIs are not allowed"],
  [/(?:src|href)\s*=\s*["']\s*https?:\/\//i, "External resources are not allowed"],
];

/** Returns why the widget is rejected, or undefined if it is self-contained. */
export const validateWidgetHtml = (html: string): string | undefined =>
  WIDGET_RULES.find(([pattern]) => pattern.test(html))?.[1];

/** Tools report failures to the model as plain messages. */
const asToolFailure = <A, E extends { readonly message: string }, R>(
  effect: Effect.Effect<A, E, R>,
) => Effect.mapError(effect, (error) => error.message);

const storeArtifact = Effect.fn("RuthTools.storeArtifact")(function* (input: {
  readonly kind: ArtifactKind;
  readonly title: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}) {
  const turn = yield* RuthTurn;
  const storage = yield* Storage;
  const database = yield* Database;
  const id = yield* newId(ArtifactId);
  const storageKey = artifactKey(turn.userId, id, input.fileName);
  yield* storage.put(storageKey, input.bytes, { contentType: input.mimeType });
  yield* database.use((db) =>
    db.insert(artifact).values({
      id,
      userId: turn.userId,
      threadId: turn.threadId,
      kind: input.kind,
      title: input.title,
      storageKey,
      mimeType: input.mimeType,
      sourceItemIds: [],
    }),
  );
  return { artifactId: id, title: input.title };
});

const MAX_READ_CHUNKS = 40;
const DEFAULT_READ_CHUNKS = 12;

export const RuthToolsLive = RuthToolkit.toLayer({
  search_materials: Effect.fn("RuthTools.searchMaterials")(function* ({ query, limit }) {
    const turn = yield* RuthTurn;
    const retrieval = yield* Retrieval;
    const hits = yield* retrieval.search(turn.userId, {
      text: query,
      ...(limit === undefined ? {} : { limit }),
    });
    return hits.map((hit) => ({
      chunkId: hit.chunkId,
      itemId: hit.itemId,
      title: hit.itemTitle,
      location: hit.location,
      content: hit.content,
    }));
  }, asToolFailure),

  read_item: Effect.fn("RuthTools.readItem")(function* ({ itemId, fromOrdinal, count }) {
    const turn = yield* RuthTurn;
    const database = yield* Database;
    const limit = Math.min(Math.max(count ?? DEFAULT_READ_CHUNKS, 1), MAX_READ_CHUNKS);
    const rows = yield* database.use((db) =>
      db
        .select({
          chunkId: chunk.id,
          title: item.title,
          location: chunk.location,
          content: chunk.content,
        })
        .from(chunk)
        .innerJoin(item, eq(chunk.itemId, item.id))
        .where(
          and(
            eq(item.id, itemId),
            eq(item.userId, turn.userId),
            ...(fromOrdinal === undefined ? [] : [gte(chunk.ordinal, fromOrdinal)]),
          ),
        )
        .orderBy(asc(chunk.ordinal))
        .limit(limit),
    );
    return rows.map((row) => ({ ...row, chunkId: ChunkId.make(row.chunkId), itemId }));
  }, asToolFailure),

  run_python: Effect.fn("RuthTools.runPython")(function* ({ code, packages }) {
    const sandboxes = yield* Sandboxes;
    const output = yield* sandboxes.runPython({
      code,
      ...(packages === undefined ? {} : { packages }),
    });
    const plots = yield* Effect.forEach(output.charts, (chart, index) =>
      storeArtifact({
        kind: "plot",
        title: chart.title ?? `Plot ${index + 1}`,
        fileName: `plot-${index + 1}.png`,
        mimeType: "image/png",
        bytes: chart.png,
      }),
    );
    return { code, stdout: output.stdout, plots };
  }, asToolFailure),

  render_manim: Effect.fn("RuthTools.renderManim")(function* ({ code, sceneName, quality }) {
    const sandboxes = yield* Sandboxes;
    const output = yield* sandboxes.renderManim({ code, sceneName, quality: quality ?? "m" });
    return yield* storeArtifact({
      kind: "video",
      title: sceneName,
      fileName: `${sceneName}.mp4`,
      mimeType: "video/mp4",
      bytes: output.video,
    });
  }, asToolFailure),

  show_widget: ({ title, html }) => {
    const problem = validateWidgetHtml(html);
    return problem === undefined ? Effect.succeed({ title, html }) : Effect.fail(problem);
  },

  propose_file_action: Effect.fn("RuthTools.proposeFileAction")(function* ({ action }) {
    const turn = yield* RuthTurn;
    const database = yield* Database;
    const id = yield* newId(ApprovalId);
    const createdAt = DateTime.formatIso(yield* DateTime.now);
    yield* database.use((db) =>
      db.insert(ruthApproval).values({ id, userId: turn.userId, threadId: turn.threadId, action }),
    );
    return { id, threadId: turn.threadId, action, status: "pending" as const, createdAt };
  }, asToolFailure),
});

/** The message parts a successful tool result contributes to Ruth's reply. */
export const toolResultParts = (result: RuthToolResult): ReadonlyArray<MessagePart> => {
  if (result.isFailure) return [];
  switch (result.name) {
    case "run_python":
      return [
        {
          _tag: "code",
          language: "python",
          source: result.result.code,
          stdout: result.result.stdout,
        },
        ...result.result.plots.map((plot): MessagePart => ({
          _tag: "plot",
          artifactId: plot.artifactId,
          alt: plot.title,
        })),
      ];
    case "render_manim":
      return [{ _tag: "video", artifactId: result.result.artifactId, title: result.result.title }];
    case "show_widget":
      return [{ _tag: "widget", title: result.result.title, html: result.result.html }];
    case "propose_file_action":
      return [{ _tag: "approval", approvalId: result.result.id }];
    case "search_materials":
    case "read_item":
      return [];
  }
};

/** Chunks returned by retrieval tools, offered as citations for the reply. */
export const toolResultCitations = (result: RuthToolResult): ReadonlyArray<Citation> => {
  if (result.isFailure || (result.name !== "search_materials" && result.name !== "read_item"))
    return [];
  return result.result.map((hit) => ({
    chunkId: hit.chunkId,
    itemId: hit.itemId,
    label: hit.location.page === undefined ? hit.title : `${hit.title}, p. ${hit.location.page}`,
  }));
};
