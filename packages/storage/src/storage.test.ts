import { describe, expect, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { StorageKey } from "@avenire/contracts";

import { fitKey, ObjectNotFound, Storage, StorageMemory } from "./storage.ts";

const key = StorageKey.make("users/test/files/file/source.txt");
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
  it.effect("forwards multipart tuning to files-sdk without changing stored bytes", () =>
    Effect.gen(function* () {
      const storage = yield* Storage;
      const upload = vi.spyOn(storage.files, "upload");
      const body = new Blob(["multipart source"], { type: "text/plain" });
      const options = {
        contentType: "text/plain",
        multipart: { partSize: 8 * 1024 * 1024, concurrency: 3 },
      };
      yield* storage.put(key, body, options);
      expect(upload).toHaveBeenCalledWith(key, body, options);
      expect(new TextDecoder().decode(yield* storage.get(key))).toBe("multipart source");
      upload.mockRestore();
    }).pipe(Effect.provide(StorageMemory)),
  );
});

describe("fitKey", () => {
  it("keeps the directory, makes names URL-safe and short enough, and is stable", () => {
    const dir = "users/u/files/f/source/";
    const spaced = fitKey(`${dir}a1b2c3d4e5f6-round trip (2).txt`);
    expect(spaced).toMatch(
      /^users\/u\/files\/f\/source\/a1b2c3d4e5f6-round-trip-2-?-[0-9a-f]{8}\.txt$/,
    );
    expect(fitKey(`${dir}round trip (2).txt`)).not.toBe(fitKey(`${dir}round trip [2].txt`));
    const long = fitKey(`${dir}${"x".repeat(200)}.pdf`);
    expect(long.length).toBeLessThanOrEqual(128);
    for (const fitted of [spaced, long]) expect(fitKey(fitted)).toBe(fitted);
    expect(fitKey(`${dir}notes.md`)).toBe(`${dir}notes.md`);
  });
});
