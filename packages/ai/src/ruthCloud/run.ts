import { resolve, sep } from "node:path";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Prompt from "effect/ai/Prompt";
import * as LanguageModel from "effect/ai/LanguageModel";
import * as Tool from "effect/ai/Tool";
import * as Toolkit from "effect/ai/Toolkit";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import { and, asc, eq, gte, inArray, lt, or } from "drizzle-orm";

import { ArtifactId, UserId, type ArtifactKind, type CloudRunStatus } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import {
  artifact,
  chunk,
  cloudRun,
  cloudSchedule,
  emailOutbox,
  item,
  user,
} from "@avenire/database/schema";
import { type DesktopBox, DesktopBoxes, WORKSPACE_DIR } from "@avenire/cloud/desktop-box";
import { Storage } from "@avenire/storage/storage";
import { artifactKey } from "@avenire/storage/keys";

import { RuthCloudModelLive } from "../models.ts";
import { artifactPlan, type PlannedArtifact } from "./window.ts";
import { makeRunPrompt, RUTH_CLOUD_SYSTEM_PROMPT } from "./prompt.ts";

export class RuthCloudError extends Schema.TaggedError<RuthCloudError>()("RuthCloudError", {
  runId: Schema.String,
  message: Schema.String,
  cause: Schema.Defect(),
}) {}

export class RuthCloud extends Context.Service<
  RuthCloud,
  {
    readonly execute: (runId: string) => Effect.Effect<void, RuthCloudError>;
  }
>()("avenire/ai/RuthCloud") {}

const textBytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const decodeText = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
const isWithin = (root: string, target: string): boolean => {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  return resolvedTarget.startsWith(`${resolvedRoot}${sep}`);
};
const truncate = (value: string): string => value.slice(0, 8_000);
const artifactPath = (root: string, fileName: string): string => `${root}/out/${fileName}`;
const toDate = (instant: DateTime.DateTime | Date | string): Date =>
  DateTime.toDateUtc(DateTime.makeUnsafe(instant));

const statusUpdate = (
  database: Database["Service"],
  runId: string,
  userId: string,
  status: CloudRunStatus,
  extra: {
    readonly startedAt?: Date | null;
    readonly finishedAt?: Date | null;
    readonly error?: string | null;
  } = {},
) =>
  Effect.gen(function* () {
    yield* database.use((db) =>
      db
        .update(cloudRun)
        .set({ status, ...extra })
        .where(and(eq(cloudRun.id, runId), eq(cloudRun.userId, userId))),
    );
  });

const enqueueFailure = (
  database: Database["Service"],
  crypto: Crypto.Crypto,
  userId: string,
  runId: string,
  reason: string,
) =>
  Effect.gen(function* () {
    const id = yield* crypto.randomUUIDv7;
    const person = yield* database.use((db) =>
      db.query.user.findFirst({
        columns: { name: true, email: true },
        where: eq(user.id, userId),
      }),
    );
    if (person === undefined) return;
    const appUrl = yield* Config.String("APP_URL").pipe(
      Config.withDefault("https://avenire.space"),
    );
    yield* database.use((db) =>
      db.insert(emailOutbox).values({
        id,
        userId,
        toAddress: person.email,
        template: "cloud-run-failed",
        props: { name: person.name, reason, retryUrl: `${appUrl}/cloud` },
      }),
    );
    yield* Effect.logInfo("Queued Ruth Cloud failure email", { runId, userId });
  });

const makeToolkit = (box: DesktopBox, finished: Ref.Ref<boolean>) => {
  const Shell = Tool.make("shell", {
    description: "Run a shell command in the sandbox workspace.",
    parameters: Schema.Struct({ command: Schema.String }),
    success: Schema.Struct({ exitCode: Schema.Number, output: Schema.String }),
    failure: Schema.String,
    failureMode: "return",
  });
  const WriteFile = Tool.make("write_file", {
    description:
      "Write a new file under /workspace/out. Paths outside that directory are rejected.",
    parameters: Schema.Struct({ path: Schema.String, content: Schema.String }),
    success: Schema.Struct({ ok: Schema.Boolean }),
    failure: Schema.String,
    failureMode: "return",
  });
  const ReadFile = Tool.make("read_file", {
    description: "Read a file under /workspace. Paths outside that directory are rejected.",
    parameters: Schema.Struct({ path: Schema.String }),
    success: Schema.Struct({ content: Schema.String }),
    failure: Schema.String,
    failureMode: "return",
  });
  const Finish = Tool.make("finish", {
    description: "Finish the run after all requested artifacts are complete.",
    parameters: Schema.Struct({ summary: Schema.String }),
    success: Schema.Struct({ ok: Schema.Boolean }),
  });
  const toolkit = Toolkit.make(Shell, WriteFile, ReadFile, Finish);
  const workspace = WORKSPACE_DIR;
  const out = `${workspace}/out`;
  const handlers = toolkit.toLayer({
    shell: ({ command }) =>
      box.shell(command, { cwd: workspace, timeoutSeconds: 300 }).pipe(
        Effect.map(({ exitCode, stdout }) => ({ exitCode, output: truncate(stdout) })),
        Effect.mapError(String),
      ),
    write_file: ({ path, content }) => {
      if (!isWithin(out, path)) return Effect.fail("write_file path must be inside /workspace/out");
      return box
        .writeFile(path, textBytes(content))
        .pipe(Effect.as({ ok: true }), Effect.mapError(String));
    },
    read_file: ({ path }) => {
      if (!isWithin(workspace, path))
        return Effect.fail("read_file path must be inside /workspace");
      return box.readFile(path).pipe(
        Effect.map((bytes) => ({ content: truncate(decodeText(bytes)) })),
        Effect.mapError(String),
      );
    },
    finish: () => Ref.set(finished, true).pipe(Effect.as({ ok: true })),
  });
  return { toolkit, handlers };
};

const MAX_AGENT_STEPS = 40;

/**
 * Drive the model until it calls `finish` or stops calling tools. Each step's
 * response (tool calls and their results) is appended to the prompt for the next.
 */
const runAgent = (
  model: LanguageModel.LanguageModel,
  box: DesktopBox,
  planned: ReadonlyArray<PlannedArtifact>,
) =>
  Effect.gen(function* () {
    const finished = yield* Ref.make(false);
    const { toolkit, handlers } = makeToolkit(box, finished);
    let prompt = Prompt.make([
      { role: "system", content: RUTH_CLOUD_SYSTEM_PROMPT },
      { role: "user", content: makeRunPrompt(planned) },
    ]);
    for (let step = 0; step < MAX_AGENT_STEPS; step++) {
      const response = yield* model
        .generateText({ prompt, toolkit })
        .pipe(Effect.provide(handlers));
      if ((yield* Ref.get(finished)) || response.toolCalls.length === 0) return;
      prompt = Prompt.concat(prompt, Prompt.fromResponseParts(response.content));
    }
    return yield* Effect.fail(
      new Error(`Ruth Cloud did not finish within ${MAX_AGENT_STEPS} steps`),
    );
  });

const insertEmail = (
  database: Database["Service"],
  crypto: Crypto.Crypto,
  userId: string,
  date: string,
  itemsStudied: number,
  entries: ReadonlyArray<{
    readonly id: string;
    readonly kind: ArtifactKind;
    readonly title: string;
  }>,
) =>
  Effect.gen(function* () {
    const id = yield* crypto.randomUUIDv7;
    const person = yield* database.use((db) =>
      db.query.user.findFirst({
        columns: { name: true, email: true },
        where: eq(user.id, userId),
      }),
    );
    if (person === undefined) return;
    const appUrl = yield* Config.String("APP_URL").pipe(
      Config.withDefault("https://avenire.space"),
    );
    const artifacts = entries.map(({ id, kind, title }) => ({
      kind,
      title,
      url: `${appUrl}/artifacts/${id}`,
    }));
    yield* database.use((db) =>
      db.insert(emailOutbox).values({
        id,
        userId,
        toAddress: person.email,
        template: "morning-digest",
        props: { name: person.name, date, itemsStudied, artifacts },
      }),
    );
  });

export const RuthCloudLive = Layer.effect(
  RuthCloud,
  Effect.gen(function* () {
    const database = yield* Database;
    const storage = yield* Storage;
    const boxes = yield* DesktopBoxes;
    const crypto = yield* Crypto.Crypto;
    const model = yield* LanguageModel.LanguageModel;

    const executeInternal = Effect.fn("RuthCloud.execute")(function* (runId: string) {
      const run = yield* database
        .use((db) => db.query.cloudRun.findFirst({ where: eq(cloudRun.id, runId) }))
        .pipe(
          Effect.mapError((cause) => new RuthCloudError({ runId, message: String(cause), cause })),
        );
      if (run === undefined)
        return yield* new RuthCloudError({
          runId,
          message: "Cloud run not found",
          cause: new Error("Cloud run not found"),
        });

      const attempt = Effect.gen(function* () {
        const schedule = yield* database.use((db) =>
          db.query.cloudSchedule.findFirst({
            where: eq(cloudSchedule.userId, run.userId),
          }),
        );
        if (schedule === undefined)
          return yield* Effect.fail(new Error("Cloud schedule not found"));
        const planned = artifactPlan(schedule.artifactKinds);
        const startedAt = yield* DateTime.now;
        yield* statusUpdate(database, runId, run.userId, "provisioning", {
          startedAt: DateTime.toDateUtc(startedAt),
          error: null,
        });

        const start = toDate(run.windowStart);
        const end = toDate(run.windowEnd);
        const touchedItems = yield* database.use((db) =>
          db.query.item.findMany({
            where: and(
              eq(item.userId, run.userId),
              or(
                and(gte(item.createdAt, start), lt(item.createdAt, end)),
                and(gte(item.updatedAt, start), lt(item.updatedAt, end)),
              ),
            ),
            orderBy: [asc(item.createdAt)],
          }),
        );
        if (touchedItems.length === 0) {
          const finishedAt = yield* DateTime.now;
          yield* statusUpdate(database, runId, run.userId, "succeeded", {
            finishedAt: DateTime.toDateUtc(finishedAt),
            error: null,
          });
          return;
        }
        const touchedIds = touchedItems.map(({ id }) => id);
        const chunks = yield* database.use((db) =>
          db
            .select({
              itemId: chunk.itemId,
              ordinal: chunk.ordinal,
              content: chunk.content,
            })
            .from(chunk)
            .where(and(eq(chunk.userId, run.userId), inArray(chunk.itemId, touchedIds)))
            .orderBy(asc(chunk.itemId), asc(chunk.ordinal)),
        );
        const materials = new Map(touchedItems.map((entry) => [entry.id, [] as Array<string>]));
        for (const part of chunks) materials.get(part.itemId)?.push(part.content);

        yield* Effect.scoped(
          Effect.gen(function* () {
            const box = yield* boxes.open({ userId: run.userId, runId });
            const materialsDir = `${WORKSPACE_DIR}/materials`;
            const outDir = `${WORKSPACE_DIR}/out`;
            yield* box.shell(`mkdir -p ${materialsDir} ${outDir}`, { cwd: WORKSPACE_DIR });
            for (const entry of touchedItems) {
              const itemFile = `${materialsDir}/${encodeURIComponent(entry.id)}.md`;
              const body = `---\nitem_id: ${JSON.stringify(entry.id)}\ntitle: ${JSON.stringify(entry.title)}\nkind: ${JSON.stringify(entry.kind)}\n---\n\n${materials.get(entry.id)?.join("\n\n") ?? ""}\n`;
              yield* box.writeFile(itemFile, textBytes(body));
            }
            yield* statusUpdate(database, runId, run.userId, "running");
            yield* runAgent(model, box, planned);

            const available = yield* box.listFiles(outDir);
            const generated = planned.filter((entry) =>
              available.some((file) => !file.isDirectory && file.name === entry.fileName),
            );
            const inserted: Array<{
              readonly id: string;
              readonly kind: ArtifactKind;
              readonly title: string;
            }> = [];
            for (const entry of generated) {
              const id = ArtifactId.make(yield* crypto.randomUUIDv7);
              const bytes = yield* box.readFile(artifactPath(WORKSPACE_DIR, entry.fileName));
              const key = artifactKey(UserId.make(run.userId), id, entry.fileName);
              yield* storage.put(key, bytes, { contentType: entry.mimeType });
              yield* database.use((db) =>
                db.insert(artifact).values({
                  id,
                  userId: run.userId,
                  cloudRunId: run.id,
                  kind: entry.kind,
                  title: entry.title,
                  storageKey: key,
                  mimeType: entry.mimeType,
                  sourceItemIds: touchedIds,
                }),
              );
              inserted.push({ id, kind: entry.kind, title: entry.title });
            }
            const recording = yield* box.stopRecording;
            if (Option.isSome(recording)) {
              const id = ArtifactId.make(yield* crypto.randomUUIDv7);
              const key = artifactKey(UserId.make(run.userId), id, "recording.mp4");
              yield* storage.put(key, recording.value, { contentType: "video/mp4" });
              yield* database.use((db) =>
                db.insert(artifact).values({
                  id,
                  userId: run.userId,
                  cloudRunId: run.id,
                  kind: "recording",
                  title: "Ruth Cloud session recording",
                  storageKey: key,
                  mimeType: "video/mp4",
                  sourceItemIds: touchedIds,
                }),
              );
              inserted.push({ id, kind: "recording", title: "Ruth Cloud session recording" });
            }
            const finishedAt = yield* DateTime.now;
            yield* statusUpdate(database, runId, run.userId, "succeeded", {
              finishedAt: DateTime.toDateUtc(finishedAt),
              error: null,
            });
            yield* insertEmail(
              database,
              crypto,
              run.userId,
              DateTime.formatIsoDate(DateTime.makeUnsafe(run.windowEnd)),
              touchedItems.length,
              inserted,
            );
          }),
        );
      });

      yield* attempt.pipe(
        Effect.catchCause((cause) => {
          const reason = String(cause).slice(0, 2_000);
          return Effect.gen(function* () {
            const failedAt = yield* DateTime.now;
            yield* statusUpdate(database, runId, run.userId, "failed", {
              finishedAt: DateTime.toDateUtc(failedAt),
              error: reason,
            });
            yield* enqueueFailure(database, crypto, run.userId, runId, reason);
            return yield* Effect.fail(new RuthCloudError({ runId, message: reason, cause }));
          });
        }),
      );
    });

    const execute = (runId: string) =>
      executeInternal(runId).pipe(
        Effect.mapError((cause) =>
          cause instanceof RuthCloudError
            ? cause
            : new RuthCloudError({ runId, message: String(cause), cause }),
        ),
      );

    return RuthCloud.of({ execute });
  }),
).pipe(Layer.provide(RuthCloudModelLive));
