/**
 * Live Ruth Cloud check: starts a one-off run for the demo user exactly like POST /api/ruth/cloud
 * (CloudTasks.runAdHoc), executes it with the worker's Cloud scheduler/executor in this process
 * (no ingestion worker, so publishing doesn't trigger paid indexing), and prints the streamed
 * run event log as it arrives. Then summarises what landed in the database.
 *   pnpm --filter @avenire/web cloud:check -- [--model ruth-sprint] "prompt"
 */
import { CloudRunEvents } from "@avenire/ai/cloud/events";
import { RuthCloudLive } from "@avenire/ai/ruth-cloud";
import { CloudRunsLive, CloudSchedulerLive, CloudTasks } from "@avenire/ai/scheduler";
import { UserId } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { mkdir, writeFile } from "node:fs/promises";

import { ServicesLive } from "../src/server/services.ts";

const DEMO_USER = UserId.make("demo-ruth-user");
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const modelAt = args.indexOf("--model");
const model = (modelAt === -1 ? "ruth-sprint" : args.splice(modelAt, 2)[1]) as
  | "ruth-sprint"
  | "ruth-core"
  | "ruth-apex";
const prompt = args.join(" ");
if (!prompt) throw new Error("Pass the run prompt");

const CheckLive = CloudSchedulerLive.pipe(
  Layer.provideMerge(CloudRunsLive.pipe(Layer.provideMerge(RuthCloudLive))),
  Layer.provideMerge(ServicesLive),
);
const runtime = ManagedRuntime.make(CheckLive);
const out = `/tmp/ruth-cloud-check/${Date.now()}`;
await mkdir(out, { recursive: true });
const started = Date.now();
const chunks: unknown[] = [];
const elapsed = () => `${((Date.now() - started) / 1000).toFixed(1)}s`.padStart(7);

try {
  const { runId, stream } = await runtime.runPromise(
    Effect.gen(function* () {
      const tasks = yield* CloudTasks;
      const run = yield* tasks.runAdHoc(DEMO_USER, {
        prompt,
        model,
        network: "packages",
        timeZone: "Asia/Kolkata",
      });
      const events = yield* CloudRunEvents;
      return { runId: run.id, stream: yield* events.stream(DEMO_USER, run.id) };
    }),
  );
  process.stdout.write(`run ${runId} (${model})\n`);
  let text = "";
  for await (const chunk of stream as AsyncIterable<Record<string, unknown>>) {
    chunks.push(chunk);
    const type = String(chunk.type);
    if (type === "text-delta") text += String(chunk.delta ?? "");
    else {
      if (text.trim()) process.stdout.write(`${elapsed()}  text: ${text.trim().slice(0, 300)}\n`);
      text = "";
      if (type === "tool-input-available")
        process.stdout.write(
          `${elapsed()}  → ${String(chunk.toolName)} ${JSON.stringify(chunk.input).slice(0, 220)}\n`,
        );
      else if (type === "tool-output-available")
        process.stdout.write(`${elapsed()}  ← ${JSON.stringify(chunk.output).slice(0, 260)}\n`);
      else if (type === "tool-output-error" || type === "error")
        process.stdout.write(`${elapsed()}  ! ${JSON.stringify(chunk).slice(0, 300)}\n`);
    }
  }
  if (text.trim()) process.stdout.write(`${elapsed()}  text: ${text.trim().slice(0, 600)}\n`);
  const summary = await runtime.runPromise(
    Effect.gen(function* () {
      const database = yield* Database;
      return yield* database.use(async (db) => ({
        run: await db.query.cloudRun.findFirst({
          where: (r, { eq }) => eq(r.id, runId),
          columns: {
            status: true,
            error: true,
            summary: true,
            stepIndex: true,
            usage: true,
            folderId: true,
          },
        }),
        hydrations: await db.query.cloudHydration.findMany({
          where: (h, { eq }) => eq(h.runId, runId),
          columns: { trigger: true, files: true, totalBytes: true },
        }),
        approvals: await db.query.pendingApproval.findMany({
          where: (a, { eq }) => eq(a.runId, runId),
          columns: {
            id: true,
            status: true,
            fileId: true,
            proposedKey: true,
            conflict: true,
            summary: true,
          },
        }),
        assets: await db.query.asset.findMany({
          where: (a, { eq }) => eq(a.runId, runId),
          columns: { id: true, kind: true, title: true, storageKey: true, sizeBytes: true },
        }),
        outputs: await db.query.file.findMany({
          where: (f, { and, eq }) => and(eq(f.userId, DEMO_USER), eq(f.source, "ruth-cloud")),
          columns: { id: true, title: true, storageKey: true, sizeBytes: true, createdAt: true },
        }),
        toolCalls: await db.query.cloudToolCall.findMany({
          where: (t, { eq }) => eq(t.runId, runId),
          columns: { name: true, status: true },
        }),
      }));
    }),
  );
  await writeFile(`${out}/events.json`, JSON.stringify(chunks, null, 1));
  await writeFile(`${out}/summary.json`, JSON.stringify(summary, null, 2));
  process.stdout.write(
    `\n${JSON.stringify(summary, null, 2).slice(0, 6000)}\n\nSaved to ${out} in ${elapsed().trim()}\n`,
  );
} finally {
  await runtime.dispose();
}
