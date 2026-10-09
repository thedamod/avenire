import { Database } from "@avenire/database/client";
import { expect, it } from "@effect/vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import * as ConfigProvider from "effect/ConfigProvider";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import {
  makeSandboxMeter,
  SandboxMeterSettings,
  SandboxMeterSettingsLive,
} from "./sandbox-meter.ts";
import { ctx, fakeDatabase } from "./test-support.ts";

it.effect("uses UTC day, enforces allowance and increments atomically", () => {
  let used = 0;
  const writes: Array<{ day: string; seconds: number; sql: string }> = [];
  const database = fakeDatabase({
    query: { sandboxUsage: { findFirst: async () => ({ chatSeconds: used }) } },
    insert: () => ({
      values: (values: { day: string; chatSeconds: number }) => ({
        onConflictDoUpdate: async ({ set }: { set: { chatSeconds: SQL } }) => {
          writes.push({
            day: values.day,
            seconds: values.chatSeconds,
            sql: new PgDialect().sqlToQuery(set.chatSeconds).sql,
          });
          used += values.chatSeconds;
          return [];
        },
      }),
    }),
  });
  return Effect.gen(function* () {
    const meter = yield* makeSandboxMeter();
    yield* meter.ensureAllowance(ctx.userId);
    yield* meter.record(ctx.userId, 59.1);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual({
      day: DateTime.formatIsoDateUtc(yield* DateTime.now),
      seconds: 60,
      sql: expect.stringContaining('"sandbox_usage"."chat_seconds" +'),
    });
    expect(yield* meter.ensureAllowance(ctx.userId).pipe(Effect.result)).toMatchObject({
      failure: { _tag: "SandboxQuotaExceeded", reason: expect.any(String) },
    });
  }).pipe(
    Effect.provideService(Database, database),
    Effect.provideService(SandboxMeterSettings, { dailySeconds: 60 }),
  );
});
for (const configured of [undefined, "120"])
  it.effect(
    `loads ${configured === undefined ? "default" : "configured"} quota through its layer`,
    () =>
      Effect.gen(function* () {
        expect((yield* SandboxMeterSettings).dailySeconds).toBe(
          configured === undefined ? 3600 : 120,
        );
      }).pipe(
        Effect.provide(SandboxMeterSettingsLive),
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromUnknown(
              configured === undefined ? {} : { CHAT_SANDBOX_DAILY_SECONDS: configured },
            ),
          ),
        ),
      ),
  );

it.effect("ledger failures fail closed and retain the meter's Cloud-compatible error channel", () =>
  Effect.gen(function* () {
    const meter = yield* makeSandboxMeter();
    const exit = yield* meter.ensureAllowance(ctx.userId).pipe(Effect.exit);
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") expect(exit.cause.reasons[0]?._tag).toBe("Die");
  }).pipe(
    Effect.provideService(
      Database,
      fakeDatabase({
        query: {
          sandboxUsage: {
            findFirst: async () => {
              throw new Error("ledger unavailable");
            },
          },
        },
      }),
    ),
    Effect.provideService(SandboxMeterSettings, { dailySeconds: 60 }),
  ),
);
