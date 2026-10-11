import { CloudRunId, Unauthorized, UserId } from "@avenire/contracts";
import { Database, type DatabaseError } from "@avenire/database/client";
import { cloudRunToken } from "@avenire/database/schema";
import { newId } from "@avenire/shared/id";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import * as Context from "effect/Context";
import type * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";

export type RunScope = "retrieval" | "download" | "hydrate" | "publish";
export interface VerifiedRunToken {
  readonly userId: UserId;
  readonly runId: CloudRunId;
  readonly scopes: ReadonlyArray<RunScope>;
}
const TokenId = Schema.NonEmptyString.pipe(Schema.brand("RunTokenId"));
export class RunTokens extends Context.Service<
  RunTokens,
  {
    readonly mint: (
      input: VerifiedRunToken & { readonly expiresAt: DateTime.Utc },
    ) => Effect.Effect<
      { token: string; tokenId: string },
      DatabaseError | PlatformError.PlatformError,
      Crypto.Crypto
    >;
    readonly verify: (
      token: string,
    ) => Effect.Effect<VerifiedRunToken, Unauthorized | DatabaseError>;
    readonly revokeRun: (runId: CloudRunId) => Effect.Effect<void, DatabaseError>;
  }
>()("avenire/ai/RunTokens") {}

/** Only hashes reach the database; the clear bearer credential is returned once. */
export const makeRunTokens = Effect.fn("RunTokens.make")(function* () {
  const database = yield* Database;
  const hash = (token: string) => createHash("sha256").update(token).digest("hex");
  return RunTokens.of({
    mint: Effect.fn("RunTokens.mint")(function* (input) {
      const token = yield* Effect.sync(() => randomBytes(32).toString("base64url"));
      const tokenId = yield* newId(TokenId);
      const tokenHash = yield* Effect.sync(() => hash(token));
      yield* database.use((db) =>
        db.insert(cloudRunToken).values({
          id: tokenId,
          userId: input.userId,
          runId: input.runId,
          scopes: input.scopes,
          expiresAt: DateTime.toDateUtc(input.expiresAt),
          tokenHash,
        }),
      );
      return { token, tokenId };
    }),
    verify: Effect.fn("RunTokens.verify")(function* (token) {
      // Tokens minted here have one canonical 43-character base64url representation.
      if (!/^[\w-]{43}$/.test(token)) return yield* new Unauthorized({});
      const now = yield* DateTime.now;
      const tokenHash = yield* Effect.sync(() => hash(token));
      const row = yield* database.use((db) =>
        db.query.cloudRunToken.findFirst({
          where: and(
            eq(cloudRunToken.tokenHash, tokenHash),
            isNull(cloudRunToken.revokedAt),
            gt(cloudRunToken.expiresAt, DateTime.toDateUtc(now)),
          ),
        }),
      );
      if (row === undefined) return yield* new Unauthorized({});
      return {
        userId: UserId.make(row.userId),
        runId: CloudRunId.make(row.runId),
        scopes: row.scopes,
      };
    }),
    revokeRun: Effect.fn("RunTokens.revokeRun")((runId) =>
      database
        .use((db) =>
          db
            .update(cloudRunToken)
            .set({ revokedAt: sql`now()` })
            .where(eq(cloudRunToken.runId, runId)),
        )
        .pipe(Effect.asVoid),
    ),
  });
});
export const RunTokensLive = Layer.effect(RunTokens, makeRunTokens());
