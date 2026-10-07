/**
 * Ruth's tools with their server-side `execute`, bound to one chat request. Each `execute` runs an Effect program
 * against the services captured when Ruth was built. Failures reach the model as
 * tool errors: domain errors keep their message, defects become a generic one so
 * nothing internal leaks into the conversation.
 */
import {
  ArtifactId,
  type ArtifactKind,
  ChunkId,
  type FileAction,
  ItemId,
  NotFound,
  type PageContext,
  type ThreadId,
  type UserId,
} from "@avenire/contracts";
import { Sandboxes } from "@avenire/cloud/sandbox";
import { Database } from "@avenire/database/client";
import { artifact, chunk, cluster, item, itemCluster } from "@avenire/database/schema";
import { Retrieval } from "@avenire/ingestion/retrieval";
import { SemanticCache } from "@avenire/ingestion/retrieval/cache";
import { enqueueIngestion } from "@avenire/ingestion/worker";
import { newId } from "@avenire/shared/id";
import { artifactKey, itemSourceKey } from "@avenire/storage/keys";
import { Storage } from "@avenire/storage/storage";
import { tool } from "ai";
import { and, asc, eq, gte } from "drizzle-orm";
import * as Cause from "effect/Cause";
import type * as Context from "effect/Context";
import type * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import {
  askUserSpec,
  getPageContextSpec,
  type PageContextResult,
  proposeFileActionSpec,
  readItemSpec,
  runPythonSpec,
  searchMaterialsSpec,
} from "./index.ts";
import { VISUAL_BUDGETS, VISUAL_RUNTIME } from "./page.ts";
import { loadSkillTool } from "./skills.ts";

/** What tool programs may use. */
export type RuthToolServices =
  | Database
  | Storage
  | Retrieval
  | SemanticCache
  | Sandboxes
  | Crypto.Crypto;

/** The request a toolset is built for. */
export interface RuthTurn {
  readonly userId: UserId;
  readonly threadId: ThreadId;
  readonly page: PageContext;
  readonly existingVisuals: PageContextResult["existingVisuals"];
}

/** A tool failure as the model sees it. */
export class RuthToolError extends Schema.TaggedError<RuthToolError>()("RuthToolError", {
  tool: Schema.String,
  message: Schema.String,
}) {}

const UNEXPECTED_FAILURE = "The tool failed unexpectedly. Try a different approach.";

const MAX_READ_CHUNKS = 40;
const DEFAULT_READ_CHUNKS = 12;

const storeFigure = Effect.fn("RuthTools.storeFigure")(function* (
  turn: RuthTurn,
  input: {
    readonly kind: ArtifactKind;
    readonly title: string;
    readonly fileName: string;
    readonly mimeType: string;
    readonly bytes: Uint8Array;
  },
) {
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

const moveItem = Effect.fn("RuthTools.moveItem")(function* (
  userId: UserId,
  action: Extract<FileAction, { readonly _tag: "move" }>,
) {
  const database = yield* Database;
  const moved = yield* database.useTransaction(async (tx) => {
    const target = await tx.query.cluster.findFirst({
      columns: { id: true },
      where: and(eq(cluster.id, action.toClusterId), eq(cluster.userId, userId)),
    });
    const owned = await tx.query.item.findFirst({
      columns: { id: true },
      where: and(eq(item.id, action.itemId), eq(item.userId, userId)),
    });
    if (target === undefined || owned === undefined) return false;
    await tx
      .delete(itemCluster)
      .where(and(eq(itemCluster.itemId, action.itemId), eq(itemCluster.userId, userId)));
    await tx.insert(itemCluster).values({ itemId: action.itemId, clusterId: target.id, userId });
    return true;
  });
  if (!moved) return yield* new NotFound({ entity: "Item or cluster", id: action.itemId });
  const cache = yield* SemanticCache;
  yield* cache.invalidate(userId);
  return { itemId: action.itemId, summary: "Moved the item to another cluster." };
});

const updateItem = Effect.fn("RuthTools.updateItem")(function* (
  userId: UserId,
  itemId: ItemId,
  changes: { readonly title?: string; readonly placement?: "archived" },
  summary: string,
) {
  const database = yield* Database;
  const updated = yield* database.use((db) =>
    db
      .update(item)
      .set(changes)
      .where(and(eq(item.id, itemId), eq(item.userId, userId)))
      .returning({ id: item.id }),
  );
  if (updated.length === 0) return yield* new NotFound({ entity: "Item", id: itemId });
  // Titles are part of the index (embedding text and lexical weight A).
  if (changes.title !== undefined) yield* enqueueIngestion(userId, itemId);
  const cache = yield* SemanticCache;
  yield* cache.invalidate(userId);
  return { itemId, summary };
});

const createNote = Effect.fn("RuthTools.createNote")(function* (
  userId: UserId,
  action: Extract<FileAction, { readonly _tag: "create-note" }>,
) {
  const storage = yield* Storage;
  const database = yield* Database;
  const id = yield* newId(ItemId);
  const storageKey = itemSourceKey(userId, id, "note.md");
  const bytes = new TextEncoder().encode(action.markdown);
  yield* storage.put(storageKey, bytes, { contentType: "text/markdown" });
  yield* database.use((db) =>
    db.insert(item).values({
      id,
      userId,
      kind: "note",
      title: action.title,
      storageKey,
      mimeType: "text/markdown",
      sizeBytes: bytes.byteLength,
      dedupeKey: `ruth-note:${id}`,
    }),
  );
  yield* enqueueIngestion(userId, id);
  return { itemId: id, summary: `Created the note "${action.title}".` };
});

const applyFileAction = (userId: UserId, action: FileAction) => {
  switch (action._tag) {
    case "move":
      return moveItem(userId, action);
    case "rename":
      return updateItem(
        userId,
        action.itemId,
        { title: action.title },
        `Renamed the item to "${action.title}".`,
      );
    case "delete":
      // Archive rather than delete, so a mistaken action is recoverable.
      return updateItem(userId, action.itemId, { placement: "archived" }, "Archived the item.");
    case "create-note":
      return createNote(userId, action);
  }
};

/** Interruptions stay interruptions; anything else becomes a model-safe tool error. */
const toolFailure = (
  tool: string,
  cause: Cause.Cause<{ readonly message: string }>,
): Effect.Effect<never, RuthToolError> =>
  Cause.hasInterruptsOnly(cause)
    ? Effect.interrupt
    : Effect.fail(
        new RuthToolError({
          tool,
          message: Option.match(Cause.findErrorOption(cause), {
            onNone: () => UNEXPECTED_FAILURE,
            onSome: (error) => error.message,
          }),
        }),
      );

/** Builds the toolset for one request; `services` are captured once by the Ruth layer. */
export const createRuthTools = (services: Context.Context<RuthToolServices>, turn: RuthTurn) => {
  const run =
    <A>(name: string, program: Effect.Effect<A, { readonly message: string }, RuthToolServices>) =>
    (abortSignal: AbortSignal | undefined): Promise<A> =>
      Effect.runPromiseWith(services)(
        program.pipe(
          Effect.tapCause((cause) => Effect.logWarning(`Ruth tool ${name} failed`, cause)),
          Effect.catchCause((cause) => toolFailure(name, cause)),
        ),
        { signal: abortSignal },
      );

  return {
    load_skill: loadSkillTool(),

    search_materials: tool({
      ...searchMaterialsSpec,
      execute: ({ query, limit, depth }, { abortSignal }) =>
        run(
          "search_materials",
          Effect.gen(function* () {
            const retrieval = yield* Retrieval;
            const result = yield* retrieval.search(turn.userId, {
              text: query,
              ...(limit === undefined ? {} : { limit }),
              ...(depth === undefined ? {} : { depth }),
            });
            return {
              hits: result.hits.map((hit) => ({
                chunkId: hit.chunkId,
                itemId: hit.itemId,
                title: hit.itemTitle,
                location: hit.location,
                content: hit.content,
                relevance: hit.relevance,
                ...(hit.context === undefined ? {} : { context: hit.context }),
              })),
              facts: result.facts,
              aspects: result.aspects,
              abstained: result.abstained,
            };
          }),
        )(abortSignal),
    }),

    read_item: tool({
      ...readItemSpec,
      execute: ({ itemId, fromOrdinal, count }, { abortSignal }) =>
        run(
          "read_item",
          Effect.gen(function* () {
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
          }),
        )(abortSignal),
    }),

    run_python: tool({
      ...runPythonSpec,
      execute: ({ code, packages }, { abortSignal }) =>
        run(
          "run_python",
          Effect.gen(function* () {
            const sandboxes = yield* Sandboxes;
            const output = yield* sandboxes.runPython({
              code,
              ...(packages === undefined ? {} : { packages }),
            });
            const figures = yield* Effect.forEach(output.charts, (chart, index) =>
              storeFigure(turn, {
                kind: "plot",
                title: chart.title ?? `Figure ${index + 1}`,
                fileName: `figure-${index + 1}.png`,
                mimeType: "image/png",
                bytes: chart.png,
              }),
            );
            return { stdout: output.stdout, exitCode: output.exitCode, figures };
          }),
        )(abortSignal),
    }),

    get_page_context: tool({
      ...getPageContextSpec,
      execute: (): PageContextResult => ({
        ...turn.page,
        runtime: VISUAL_RUNTIME,
        budgets: VISUAL_BUDGETS,
        existingVisuals: turn.existingVisuals,
      }),
    }),

    propose_file_action: tool({
      ...proposeFileActionSpec,
      execute: ({ action }, { abortSignal }) =>
        run("propose_file_action", applyFileAction(turn.userId, action))(abortSignal),
    }),

    ask_user: tool(askUserSpec),
  };
};
