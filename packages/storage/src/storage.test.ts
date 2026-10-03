import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { Storage, StorageMemory, ObjectNotFound } from "./storage.js";
import type { StorageKey } from "@avenire/contracts";

const key = "users/test/items/item/source.txt" as StorageKey;

describe("StorageMemory", () => {
  it.effect("supports put, get, head, list, remove, and missing objects", () =>
    Effect.gen(function* () {
      const storage = yield* Storage;
      yield* storage.put(key, "hello", { contentType: "text/plain" });

      expect(new TextDecoder().decode(yield* storage.get(key))).toBe("hello");
      expect(yield* storage.head(key)).toMatchObject({ size: 5, contentType: "text/plain" });
      expect(yield* storage.list("users/test/" as StorageKey)).toEqual([{ key, size: 5 }]);

      yield* storage.remove(key);
      const missing = yield* Effect.flip(storage.get(key));
      expect(missing).toBeInstanceOf(ObjectNotFound);
      expect(missing.key).toBe(key);
      expect(yield* storage.list("users/test/" as StorageKey)).toEqual([]);
    }).pipe(Effect.provide(StorageMemory)),
  );
});
