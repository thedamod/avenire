import { Database } from "@avenire/database/client";
import { sandboxUsage } from "@avenire/database/schema";
import { and, eq, sql } from "drizzle-orm";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

/** Mirrors Cloud's quota tag without introducing a dependency; dedupe when wiring the next slice. */
export class SandboxQuotaExceeded extends Schema.TaggedError<SandboxQuotaExceeded>()(
  "SandboxQuotaExceeded",
  { reason: Schema.String },
) {
  override get message(): string {
    return this.reason;
  }
}
export interface SandboxMeterDb {
  readonly ensureAllowance: (userId: string) => Effect.Effect<void, SandboxQuotaExceeded>;
  readonly record: (userId: string, seconds: number) => Effect.Effect<void>;
}
export class SandboxMeterSettings extends Context.Service<
  SandboxMeterSettings,
  { readonly dailySeconds: number }
>()("avenire/ruth-kit/SandboxMeterSettings") {}
export const SandboxMeterSettingsLive = Layer.effect(
  SandboxMeterSettings,
  Effect.gen(function* () {
    const dailySeconds = yield* Config.Int("CHAT_SANDBOX_DAILY_SECONDS").pipe(
      Config.withDefault(3600),
    );
    return { dailySeconds: Math.max(0, dailySeconds) };
  }),
);

/** Config is supplied by a layer so the factory can be wired to Cloud's independently owned tag. */
export const makeSandboxMeter = Effect.fn("SandboxMeter.make")(function* (): Effect.fn.Return<
  SandboxMeterDb,
  never,
  Database | SandboxMeterSettings
> {
  const database = yield* Database;
  const settings = yield* SandboxMeterSettings;
  return {
    ensureAllowance: Effect.fn("SandboxMeter.ensureAllowance")(function* (userId) {
      const day = DateTime.formatIsoDateUtc(yield* DateTime.now);
      // An unavailable usage ledger must fail closed as a defect, never masquerade as quota exhaustion.
      const row = yield* database
        .use((db) =>
          db.query.sandboxUsage.findFirst({
            where: and(eq(sandboxUsage.userId, userId), eq(sandboxUsage.day, day)),
          }),
        )
        .pipe(Effect.orDie);
      if ((row?.chatSeconds ?? 0) >= settings.dailySeconds)
        return yield* new SandboxQuotaExceeded({
          reason: "The daily chat sandbox allowance has been exhausted.",
        });
    }),
    record: Effect.fn("SandboxMeter.record")(function* (userId, seconds) {
      const day = DateTime.formatIsoDateUtc(yield* DateTime.now);
      const elapsed = Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : 0;
      yield* database
        .use((db) =>
          db
            .insert(sandboxUsage)
            .values({ userId, day, chatSeconds: elapsed })
            .onConflictDoUpdate({
              target: [sandboxUsage.userId, sandboxUsage.day],
              set: { chatSeconds: sql`${sandboxUsage.chatSeconds} + ${elapsed}` },
            }),
        )
        .pipe(Effect.orDie);
    }),
  };
});
