import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import type * as PlatformError from "effect/PlatformError";

/**
 * A fresh time-ordered id (UUIDv7) branded for `schema`. Ids sort by creation
 * time, which keeps btree inserts append-only and lets lists order by id.
 */
export const newId = <Id extends string>(schema: {
  readonly make: (input: string) => Id;
}): Effect.Effect<Id, PlatformError.PlatformError, Crypto.Crypto> =>
  Effect.flatMap(Effect.service(Crypto.Crypto), (crypto) => crypto.randomUUIDv7).pipe(
    Effect.map(schema.make),
  );
