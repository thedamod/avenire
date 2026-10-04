/**
 * One Ruth Cloud run: gather the window's material, hand it to the model in a
 * recording desktop box, then store whatever artifacts it wrote plus the screen
 * recording, and queue the morning digest (or a failure email).
 */
import { type DesktopBox, DesktopBoxes, WORKSPACE_DIR } from "@avenire/cloud/desktop-box";
import { ArtifactId, type ArtifactKind, CloudRunId, UserId } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import {
  artifact,
  chunk,
  cloudRun,
  type CloudRunRow,
  cloudSchedule,
  emailOutbox,
  item,
  type ItemRow,
  user,
} from "@avenire/database/schema";
import { newId } from "@avenire/shared/id";
import { artifactKey } from "@avenire/storage/keys";
import { Storage } from "@avenire/storage/storage";
import { and, asc, eq, gte, inArray, lt, or, type SQL, sql } from "drizzle-orm";
import { generateText, hasToolCall, stepCountIs } from "ai";
import * as Cause from "effect/Cause";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { RUTH_CLOUD_MODEL, RuthModels, RuthModelsLive } from "../models/index.ts";
import { makeRunPrompt, RUTH_CLOUD_PROMPT } from "../prompts/cloud.ts";
import { artifactPlan, type PlannedArtifact } from "../scheduler/window.ts";
import { createRuthCloudTools, MATERIALS_DIR, OUT_DIR } from "../tools/cloud.ts";

const MAX_AGENT_STEPS = 40;
const MAX_ERROR_CHARS = 2_000;

export class RuthCloudError extends Schema.TaggedError<RuthCloudError>()("RuthCloudError", {
  runId: Schema.String,
  reason: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {
  override get message(): string {
    return `Ruth Cloud run ${this.runId} failed: ${this.reason}`;
  }
}

export class RuthCloud extends Context.Service<
  RuthCloud,
  { readonly execute: (runId: CloudRunId) => Effect.Effect<void, RuthCloudError> }
>()("avenire/ai/RuthCloud") {}

const textBytes = (text: string): Uint8Array => new TextEncoder().encode(text);

const failureReason = (cause: Cause.Cause<unknown>): string => {
  const error = Cause.squash(cause);
  const reason = error instanceof Error ? error.message : Cause.pretty(cause);
  return reason.slice(0, MAX_ERROR_CHARS);
};

/** Front matter lets the model cite the item id of every source file. */
const materialFile = (entry: ItemRow, chunks: ReadonlyArray<string>): string =>
  [
    "---",
    `item_id: ${JSON.stringify(entry.id)}`,
    `title: ${JSON.stringify(entry.title)}`,
    `kind: ${JSON.stringify(entry.kind)}`,
    "---",
    "",
    chunks.join("\n\n"),
    "",
  ].join("\n");

/**
 * The Ruth Cloud agent for one box: model, system prompt, task and tools. The
 * run drives it with `generateText`, stopping when the model calls `finish`.
 */
export const createRuthCloudAgent = (options: {
  readonly models: RuthModels["Service"];
  readonly box: DesktopBox;
  readonly planned: ReadonlyArray<PlannedArtifact>;
}) => ({
  model: options.models.languageModel(RUTH_CLOUD_MODEL),
  system: RUTH_CLOUD_PROMPT(),
  prompt: makeRunPrompt(options.planned),
  tools: createRuthCloudTools(options.box),
});

/**
 * Drive the model until it calls `finish` or stops calling tools. Interrupting
 * the fiber aborts the model call and any running tool.
 */
const runAgent = Effect.fn("RuthCloud.runAgent")(function* (
  agent: ReturnType<typeof createRuthCloudAgent>,
  runId: CloudRunId,
) {
  const result = yield* Effect.tryPromise({
    try: (abortSignal) =>
      generateText({
        ...agent,
        stopWhen: [hasToolCall("finish"), stepCountIs(MAX_AGENT_STEPS)],
        abortSignal,
      }),
    catch: (cause) => new RuthCloudError({ runId, reason: "the model call failed", cause }),
  });
  const finished = result.steps.some((step) =>
    step.toolCalls.some((call) => call.toolName === "finish"),
  );
  if (finished || result.finalStep.toolCalls.length === 0) return;
  return yield* new RuthCloudError({
    runId,
    reason: `did not finish within ${MAX_AGENT_STEPS} steps`,
  });
});

interface StoredArtifact {
  readonly id: ArtifactId;
  readonly kind: ArtifactKind;
  readonly title: string;
}

export const RuthCloudLive = Layer.effect(
  RuthCloud,
  Effect.gen(function* () {
    const database = yield* Database;
    const storage = yield* Storage;
    const boxes = yield* DesktopBoxes;
    const crypto = yield* Crypto.Crypto;
    const models = yield* RuthModels;
    const appUrl = yield* Config.String("APP_URL").pipe(
      Config.withDefault("https://avenire.space"),
    );

    const setStatus = (
      run: CloudRunRow,
      status: CloudRunRow["status"],
      extra: {
        readonly startedAt?: SQL;
        readonly finishedAt?: SQL;
        readonly error?: string | null;
      } = {},
    ) =>
      database
        .use((db) =>
          db
            .update(cloudRun)
            .set({ status, ...extra })
            .where(and(eq(cloudRun.id, run.id), eq(cloudRun.userId, run.userId))),
        )
        .pipe(Effect.asVoid);

    /** Queue an email for the run's owner; skipped (and logged) if the user is gone. */
    const enqueueEmail = Effect.fn("RuthCloud.enqueueEmail")(function* (
      run: CloudRunRow,
      template: "morning-digest" | "cloud-run-failed",
      props: (person: { readonly name: string }) => Record<string, unknown>,
    ) {
      const person = yield* database.use((db) =>
        db.query.user.findFirst({
          columns: { name: true, email: true },
          where: eq(user.id, run.userId),
        }),
      );
      if (person === undefined) {
        return yield* Effect.logWarning("Skipping Ruth Cloud email for a missing user", {
          runId: run.id,
          template,
        });
      }
      const id = yield* crypto.randomUUIDv7;
      yield* database.use((db) =>
        db.insert(emailOutbox).values({
          id,
          userId: run.userId,
          toAddress: person.email,
          template,
          props: props(person),
        }),
      );
    });

    const loadMaterials = Effect.fn("RuthCloud.loadMaterials")(function* (run: CloudRunRow) {
      const inWindow = (column: typeof item.createdAt) =>
        and(gte(column, run.windowStart), lt(column, run.windowEnd));
      const items = yield* database.use((db) =>
        db.query.item.findMany({
          where: and(
            eq(item.userId, run.userId),
            or(inWindow(item.createdAt), inWindow(item.updatedAt)),
          ),
          orderBy: [asc(item.createdAt)],
        }),
      );
      if (items.length === 0) return { items, chunksByItem: new Map<string, Array<string>>() };
      const chunks = yield* database.use((db) =>
        db
          .select({ itemId: chunk.itemId, content: chunk.content })
          .from(chunk)
          .where(
            and(
              eq(chunk.userId, run.userId),
              inArray(
                chunk.itemId,
                items.map(({ id }) => id),
              ),
            ),
          )
          .orderBy(asc(chunk.itemId), asc(chunk.ordinal)),
      );
      const chunksByItem = new Map(items.map((entry) => [entry.id, [] as Array<string>]));
      for (const part of chunks) chunksByItem.get(part.itemId)?.push(part.content);
      return { items, chunksByItem };
    });

    const storeArtifact = Effect.fn("RuthCloud.storeArtifact")(function* (
      run: CloudRunRow,
      sourceItemIds: ReadonlyArray<string>,
      entry: {
        readonly kind: ArtifactKind;
        readonly title: string;
        readonly fileName: string;
        readonly mimeType: string;
        readonly bytes: Uint8Array;
      },
    ) {
      const id = yield* newId(ArtifactId);
      const key = artifactKey(UserId.make(run.userId), id, entry.fileName);
      yield* storage.put(key, entry.bytes, { contentType: entry.mimeType });
      yield* database.use((db) =>
        db.insert(artifact).values({
          id,
          userId: run.userId,
          cloudRunId: run.id,
          kind: entry.kind,
          title: entry.title,
          storageKey: key,
          mimeType: entry.mimeType,
          sourceItemIds,
        }),
      );
      const stored: StoredArtifact = { id, kind: entry.kind, title: entry.title };
      return stored;
    });

    /** Runs the agent in a fresh box and stores what it produced. The box dies with the scope. */
    const runInBox = (
      run: CloudRunRow,
      planned: ReadonlyArray<PlannedArtifact>,
      materials: Effect.Success<ReturnType<typeof loadMaterials>>,
    ) =>
      Effect.scoped(
        Effect.gen(function* () {
          const box = yield* boxes.open({ userId: run.userId, runId: run.id });
          yield* box.shell(`mkdir -p ${MATERIALS_DIR} ${OUT_DIR}`, { cwd: WORKSPACE_DIR });
          yield* Effect.forEach(
            materials.items,
            (entry) =>
              box.writeFile(
                `${MATERIALS_DIR}/${encodeURIComponent(entry.id)}.md`,
                textBytes(materialFile(entry, materials.chunksByItem.get(entry.id) ?? [])),
              ),
            { discard: true },
          );
          yield* setStatus(run, "running");
          yield* runAgent(createRuthCloudAgent({ models, box, planned }), CloudRunId.make(run.id));

          const sourceItemIds = materials.items.map(({ id }) => id);
          const written = yield* box.listFiles(OUT_DIR);
          const generated = planned.filter((entry) =>
            written.some((file) => !file.isDirectory && file.name === entry.fileName),
          );
          const artifacts = yield* Effect.forEach(generated, (entry) =>
            box
              .readFile(`${OUT_DIR}/${entry.fileName}`)
              .pipe(
                Effect.flatMap((bytes) => storeArtifact(run, sourceItemIds, { ...entry, bytes })),
              ),
          );
          const recording = yield* box.stopRecording;
          if (Option.isNone(recording)) return artifacts;
          const stored = yield* storeArtifact(run, sourceItemIds, {
            kind: "recording",
            title: "Ruth Cloud session recording",
            fileName: "recording.mp4",
            mimeType: "video/mp4",
            bytes: recording.value,
          });
          return [...artifacts, stored];
        }),
      );

    const execute = Effect.fn("RuthCloud.execute")(function* (run: CloudRunRow) {
      const schedule = yield* database.use((db) =>
        db.query.cloudSchedule.findFirst({ where: eq(cloudSchedule.userId, run.userId) }),
      );
      if (schedule === undefined) {
        return yield* new RuthCloudError({ runId: run.id, reason: "no cloud schedule" });
      }
      yield* setStatus(run, "provisioning", { startedAt: sql`now()`, error: null });

      const materials = yield* loadMaterials(run);
      // Nothing studied in the window: the run trivially succeeds and sends no digest.
      if (materials.items.length === 0) {
        return yield* setStatus(run, "succeeded", { finishedAt: sql`now()`, error: null });
      }
      const artifacts = yield* runInBox(run, artifactPlan(schedule.artifactKinds), materials);
      yield* setStatus(run, "succeeded", { finishedAt: sql`now()`, error: null });
      yield* enqueueEmail(run, "morning-digest", (person) => ({
        name: person.name,
        date: DateTime.formatIsoDate(DateTime.fromDateUnsafe(run.windowEnd)),
        itemsStudied: materials.items.length,
        artifacts: artifacts.map(({ id, kind, title }) => ({
          kind,
          title,
          url: `${appUrl}/artifacts/${id}`,
        })),
      }));
    });

    /** Persist how the run ended. Best effort: the original failure is what callers see. */
    const recordFailure = (run: CloudRunRow, cause: Cause.Cause<unknown>) => {
      if (Cause.hasInterruptsOnly(cause)) {
        return setStatus(run, "cancelled", { finishedAt: sql`now()` }).pipe(
          Effect.ignore({ log: "Error", message: "Could not mark the Ruth Cloud run cancelled" }),
        );
      }
      const reason = failureReason(cause);
      return setStatus(run, "failed", { finishedAt: sql`now()`, error: reason }).pipe(
        Effect.andThen(
          enqueueEmail(run, "cloud-run-failed", (person) => ({
            name: person.name,
            reason,
            retryUrl: `${appUrl}/cloud`,
          })),
        ),
        Effect.ignore({ log: "Error", message: "Could not record the Ruth Cloud failure" }),
      );
    };

    const toRunError = (runId: CloudRunId) => (cause: { readonly message: string }) =>
      Effect.fail(new RuthCloudError({ runId, reason: cause.message, cause }));

    return RuthCloud.of({
      execute: (runId) => {
        const program = database
          .use((db) => db.query.cloudRun.findFirst({ where: eq(cloudRun.id, runId) }))
          .pipe(
            Effect.flatMap((run) =>
              run === undefined
                ? Effect.fail(new RuthCloudError({ runId, reason: "run not found" }))
                : execute(run).pipe(Effect.onError((cause) => recordFailure(run, cause))),
            ),
            Effect.provideService(Crypto.Crypto, crypto),
          );
        return Effect.catchTag(
          program,
          "RuthCloudError",
          (error) => Effect.fail(error),
          toRunError(runId),
        );
      },
    });
  }),
).pipe(Layer.provide(RuthModelsLive));
