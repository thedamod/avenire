import { CloudRunId } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import type { CloudRunTokenRow } from "@avenire/database/schema";
import { expect, it } from "@effect/vitest";
import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createHash } from "node:crypto";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { makeRunTokens } from "./run-tokens.ts";
import { ctx, fakeDatabase, testCrypto } from "../tools/test-support.ts";

it.effect("mints hashed credentials, verifies, expires and revokes them", () => {
  let row: CloudRunTokenRow | undefined;
  let revoked = false;
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const database = fakeDatabase({
    insert: () => ({
      values: async (values: CloudRunTokenRow) => {
        row = values;
        return [];
      },
    }),
    query: {
      cloudRunToken: {
        findFirst: async ({ where }: { where: SQL }) => {
          const rendered = new PgDialect().sqlToQuery(where);
          statements.push(rendered);
          const [hash, at] = rendered.params as [string, string];
          return row &&
            row.tokenHash === hash &&
            !revoked &&
            DateTime.toEpochMillis(DateTime.makeUnsafe(row.expiresAt)) >
              DateTime.toEpochMillis(DateTime.makeUnsafe(at))
            ? row
            : undefined;
        },
      },
    },
    update: () => ({
      set: () => ({
        where: async (where: SQL) => {
          statements.push(new PgDialect().sqlToQuery(where));
          revoked = true;
          return [];
        },
      }),
    }),
  });
  return Effect.gen(function* () {
    const service = yield* makeRunTokens();
    const now = yield* DateTime.now;
    const runId = CloudRunId.make("run");
    const minted = yield* service.mint({
      userId: ctx.userId,
      runId,
      scopes: ["retrieval", "download"],
      expiresAt: DateTime.add(now, { hours: 1 }),
    });
    expect(Buffer.from(minted.token, "base64url")).toHaveLength(32);
    expect(row?.tokenHash).toBe(createHash("sha256").update(minted.token).digest("hex"));
    expect(JSON.stringify(row)).not.toContain(minted.token);
    expect(yield* service.verify(minted.token)).toEqual({
      userId: ctx.userId,
      runId,
      scopes: ["retrieval", "download"],
    });
    const filter = statements[0]!;
    expect(filter.sql).toContain('"cloud_run_token"."revoked_at" is null');
    expect(filter.sql).toContain('"cloud_run_token"."expires_at" >');
    expect(yield* service.verify("x".repeat(43)).pipe(Effect.result)).toMatchObject({
      failure: { _tag: "Unauthorized" },
    });
    expect(yield* service.verify("malformed").pipe(Effect.result)).toMatchObject({
      failure: { _tag: "Unauthorized" },
    });
    row = { ...row!, expiresAt: DateTime.toDateUtc(now) };
    expect(yield* service.verify(minted.token).pipe(Effect.result)).toMatchObject({
      failure: { _tag: "Unauthorized" },
    });
    row = { ...row!, expiresAt: DateTime.toDateUtc(DateTime.add(now, { hours: 1 })) };
    yield* service.revokeRun(runId);
    expect(statements.at(-1)?.params).toContain(runId);
    expect(yield* service.verify(minted.token).pipe(Effect.result)).toMatchObject({
      failure: { _tag: "Unauthorized" },
    });
  }).pipe(
    Effect.provideService(Database, database),
    Effect.provideService(Crypto.Crypto, testCrypto),
  );
});
