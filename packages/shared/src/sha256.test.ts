import { describe, expect, it } from "@effect/vitest";
import { createHash, randomBytes } from "node:crypto";
import { Sha256, hashBlob } from "./sha256.ts";

describe("incremental browser hashing", () => {
  it("matches native SHA-256 across padding and chunk boundaries", async () => {
    for (const length of [0, 1, 55, 56, 63, 64, 65, 127, 1000, 1024 * 1024 + 71]) {
      const bytes = randomBytes(length);
      const expected = createHash("sha256").update(bytes).digest("hex");
      for (const step of [1, 37, 65536]) {
        const hash = new Sha256();
        for (let offset = 0; offset < length; offset += step)
          hash.update(bytes.subarray(offset, offset + step));
        expect(hash.digest()).toBe(expected);
      }
      expect(await hashBlob(new Blob([bytes]))).toBe(expected);
    }
  });
});
