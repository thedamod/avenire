import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { StorageKey } from "@avenire/contracts";

import { ObjectNotFound, Storage, StorageMemory } from "./storage.ts";

const key = StorageKey.make("users/test/items/item/source.txt");
const prefix = StorageKey.make("users/test/");

describe("StorageMemory", () => {
  it.effect("supports put, get, head, list, remove, and missing objects", () =>
    Effect.gen(function* () {
      const storage = yield* Storage;
      yield* storage.put(key, "hello", { contentType: "text/plain" });

      expect(new TextDecoder().decode(yield* storage.get(key))).toBe("hello");
      expect(yield* storage.head(key)).toMatchObject({ size: 5, contentType: "text/plain" });
      expect(yield* storage.list(prefix)).toEqual([{ key, size: 5 }]);

      yield* storage.remove(key);
      const missing = yield* Effect.flip(storage.get(key));
      expect(missing).toBeInstanceOf(ObjectNotFound);
      expect(missing.key).toBe(key);
      expect(yield* storage.list(prefix)).toEqual([]);
    }).pipe(Effect.provide(StorageMemory)),
  );
});
