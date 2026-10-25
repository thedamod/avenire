import { expect, it } from "@effect/vitest";
import { FileId, IngestionJobId, type IngestionJob } from "@avenire/contracts";
import { ingestionState, isPublishedPartialRetry } from "./ingestionState";

const partial: IngestionJob = {
  id: IngestionJobId.make("job"),
  fileId: FileId.make("file"),
  status: "queued",
  attempts: 1,
  error: "Partial extraction; retry scheduled.",
  coverage: {
    status: "partial",
    parts: [
      { part: "text", status: "full" },
      { part: "ocr", status: "partial" },
    ],
  },
  createdAt: "2026-10-25T00:00:00Z",
  updatedAt: "2026-10-25T00:01:00Z",
};

it("treats committed partial content as usable while optional extraction awaits retry", () => {
  expect(isPublishedPartialRetry(partial)).toBe(true);
  expect(ingestionState(partial)).toBeNull();
});

it("keeps incomplete indexing in processing even when an earlier extraction had coverage", () => {
  expect(isPublishedPartialRetry({ ...partial, error: "Graph extraction failed" })).toBe(false);
  expect(ingestionState({ ...partial, error: "Graph extraction failed" })?.kind).toBe("processing");
  expect(ingestionState({ ...partial, status: "graphing", error: null })).toEqual({
    kind: "processing",
    label: "Linking ideas",
  });
});

it("keeps quota-blocked sources waiting instead of treating them as ready", () => {
  expect(ingestionState({ ...partial, error: "Rate limit reached on tokens per day" })).toEqual({
    kind: "processing",
    label: "Waiting for AI quota",
  });
});
