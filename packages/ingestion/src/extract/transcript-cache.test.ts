import { describe, expect, it } from "@effect/vitest";

import { transcriptCacheKey } from "./transcript-cache.ts";

describe("transcript cache key", () => {
  it("uses the exact audio clip bytes and model", () => {
    const first = transcriptCacheKey("whisper-a", new Uint8Array([1, 2, 3]));
    expect(first).toEqual(transcriptCacheKey("whisper-a", new Uint8Array([1, 2, 3])));
    expect(first.contentHash).not.toBe(
      transcriptCacheKey("whisper-a", new Uint8Array([1, 2, 4])).contentHash,
    );
    expect(first.model).not.toBe(transcriptCacheKey("whisper-b", new Uint8Array([1, 2, 3])).model);
  });
});
