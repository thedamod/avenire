/** Durable tool replay and world reconciliation use the same call id as the canonical messages. */
import { Database } from "@avenire/database/client";
import { cloudToolCall, cloudRun } from "@avenire/database/schema";
import { and, eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import * as Effect from "effect/Effect";
import { RuthToolError, type AgentContext } from "../tools/core.ts";
import type { ToolRegistration } from "../tools/registration.ts";

export const stableToolId = (ctx: Pick<AgentContext, "runId" | "toolCallId">, kind: string) => {
  const hex = createHash("sha256").update(`${ctx.runId}:${ctx.toolCallId}:${kind}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
export const withToolJournal = <R>(
  registry: Readonly<Record<string, ToolRegistration<R>>>,
): Record<string, ToolRegistration<R | Database>> =>
  Object.fromEntries(
    Object.entries(registry).map(([name, entry]) => [
      name,
      {
        ...entry,
        execute: Effect.fn(`CloudJournal.${name}`)(
          function* (input: unknown, ctx: AgentContext) {
            if (!ctx.runId || !ctx.toolCallId) return yield* entry.execute(input, ctx);
            const database = yield* Database;
            if (ctx.leaseOwner) {
              const run = yield* database.use((db) =>
                db.query.cloudRun.findFirst({
                  where: and(
                    eq(cloudRun.id, ctx.runId!),
                    eq(cloudRun.userId, ctx.userId),
                    eq(cloudRun.leasedBy, ctx.leaseOwner!),
                  ),
                }),
              );
              if (!run || !["running", "provisioning"].includes(run.status))
                return yield* new RuthToolError({
                  tool: name,
                  code: "conflict",
                  message: "The run lease was released or the run was cancelled.",
                  recoverable: false,
                });
            }

            const where = and(
              eq(cloudToolCall.runId, ctx.runId),
              eq(cloudToolCall.toolCallId, ctx.toolCallId),
            );
            const prior = yield* database.use((db) => db.query.cloudToolCall.findFirst({ where }));
            if (prior?.status === "completed") return prior.result;
            yield* database.use((db) =>
              db
                .insert(cloudToolCall)
                .values({
                  runId: ctx.runId!,
                  toolCallId: ctx.toolCallId!,
                  name,
                  input,
                  status: "started",
                })
                .onConflictDoNothing(),
            );
            if (prior?.status === "pending")
              yield* database.use((db) =>
                db.update(cloudToolCall).set({ status: "started" }).where(where),
              );
            // Deterministic publish/hydration IDs, write paths and session names reconcile the world
            // when the side effect completed but this result transaction never committed.
            if (prior?.status === "started" && name === "box_exec")
              return yield* new RuthToolError({
                tool: name,
                code: "conflict",
                message:
                  "This command may already have executed before the worker stopped. Inspect the world before starting new work; use box_command_start for durable long jobs.",
                recoverable: true,
              });
            const reconciledInput =
              prior?.status === "started" && name === "computer" ? { action: "screenshot" } : input;
            const result = yield* entry.execute(reconciledInput, ctx);
            yield* database.use((db) =>
              db
                .update(cloudToolCall)
                .set({ status: "completed", result, completedAt: sql`now()` })
                .where(where),
            );
            return result;
          },
          (effect) =>
            effect.pipe(
              Effect.catchTag("DatabaseError", () =>
                Effect.fail(
                  new RuthToolError({
                    tool: name,
                    code: "failed",
                    message:
                      "The durable tool checkpoint is unavailable. Resume the same call before making more model requests.",
                    recoverable: false,
                    checkpointFatal: true,
                  }),
                ),
              ),
            ),
        ),
      },
    ]),
  );
