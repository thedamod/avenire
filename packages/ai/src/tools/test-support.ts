/** Offline service doubles used only by colocated tests. */
import { UserId } from "@avenire/contracts";
import {
  Database,
  DatabaseError,
  type DatabaseClient,
  type DatabaseTransaction,
} from "@avenire/database/client";
import * as schema from "@avenire/database/schema";
import { drizzle } from "drizzle-orm/postgres-js";
import { Analytics, type AnalyticsEvent } from "@avenire/shared/observability";
import { createHash, randomBytes } from "node:crypto";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import type { AgentContext } from "./core.ts";

export const ctx: AgentContext = {
  userId: UserId.make("user"),
  agent: "ruth",
  fullAccess: false,
  timeZone: "UTC",
};
export const testCrypto = Crypto.make({
  randomBytes: (size) => new Uint8Array(randomBytes(size)),
  digest: (algorithm, data) =>
    Effect.sync(
      () =>
        new Uint8Array(createHash(algorithm.replace("-", "").toLowerCase()).update(data).digest()),
    ),
});
export const recordingAnalytics = (events: AnalyticsEvent[] = []) =>
  Analytics.of({
    capture: (event) =>
      Effect.sync(() => {
        events.push(event);
      }),
    captureException: () => Effect.void,
  });
export const fakeDatabase = (mock: unknown) => {
  const custom = mock as { recordStatement?: (statement: unknown) => Promise<unknown> };
  const builder = drizzle.mock({ schema });
  const db = Object.assign(builder, mock) as DatabaseClient;
  const run = async <A>(fn: (db: DatabaseClient) => Promise<A>): Promise<A> => {
    let result: Promise<A>;
    try {
      result = fn(db);
    } catch (error) {
      if (
        !(error instanceof TypeError) ||
        !error.message.includes("is not a function") ||
        !custom.recordStatement
      )
        throw error;
      result = fn(drizzle.mock({ schema }));
    }
    if (custom.recordStatement && "getSQL" in result && typeof result.getSQL === "function")
      return custom.recordStatement(result.getSQL()) as Promise<A>;
    return result;
  };
  return Database.of({
    db,
    use: (fn) =>
      Effect.tryPromise({ try: () => run(fn), catch: (cause) => new DatabaseError({ cause }) }),
    useTransaction: (fn) =>
      Effect.tryPromise({
        try: () => fn(db as unknown as DatabaseTransaction),
        catch: (cause) => new DatabaseError({ cause }),
      }),
  });
};
