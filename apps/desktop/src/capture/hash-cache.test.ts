import { expect, it } from "vite-plus/test";
import { HashLru, UploadGate, mapConcurrent } from "./hash-cache.ts";

it("evicts least-recently-used hashes and invalidates on path, size or mtime changes", () => {
  const cache = new HashLru(2);
  cache.set("/a", 10, 1, "a");
  cache.set("/b", 10, 1, "b");
  expect(cache.get("/a", 10, 1)).toBe("a");
  cache.set("/c", 10, 1, "c");
  expect(cache.get("/b", 10, 1)).toBeUndefined();
  expect(cache.get("/a", 11, 1)).toBeUndefined();
  expect(cache.get("/a", 10, 2)).toBeUndefined();
  expect(cache.get("/other", 10, 1)).toBeUndefined();
});

it("caps simultaneous work across two upload producers at three and releases failed slots", async () => {
  const gate = new UploadGate(3);
  let active = 0;
  let peak = 0;
  let finished = 0;
  const run = async (index: number) =>
    gate
      .run(async () => {
        active++;
        peak = Math.max(peak, active);
        try {
          await new Promise((resolve) => setTimeout(resolve, 2));
          if (index === 2) throw new Error("expected failure");
        } finally {
          active--;
          finished++;
        }
      })
      .catch(() => {});
  await Promise.all([
    mapConcurrent([0, 1, 2, 3, 4, 5], 3, run),
    mapConcurrent([6, 7, 8, 9], 3, run),
  ]);
  expect(peak).toBe(3);
  expect(active).toBe(0);
  expect(finished).toBe(10);
});
