import { describe, expect, it } from "vite-plus/test";
import { FileId, IngestionJobId, type IngestionJob } from "@avenire/contracts";
import { ingestionState, isPublishedPartialRetry, type AccessFile } from "./ingestionState";

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
const indexed: IngestionJob = { ...partial, status: "indexed", error: null, coverage: null };
const open: AccessFile = { access: "open", origin: null, sourceUrl: null };
const web = (access: AccessFile["access"], url = "https://www.jstor.org/stable/123?x=1") =>
  ({
    access,
    sourceUrl: "https://citation.example/123",
    origin: {
      _tag: "Web",
      url,
      title: "Article",
      browser: "chrome",
      capturedAt: "2026-10-25T00:00:00Z",
    },
  }) satisfies AccessFile;

describe("ingestionState", () => {
  it("treats committed partial content as usable while optional extraction awaits retry", () => {
    expect(isPublishedPartialRetry(partial)).toBe(true);
    expect(ingestionState(partial, open)).toBeNull();
  });

  it("keeps incomplete indexing in processing even when an earlier extraction had coverage", () => {
    expect(isPublishedPartialRetry({ ...partial, error: "Graph extraction failed" })).toBe(false);
    expect(ingestionState({ ...partial, error: "Graph extraction failed" }, open)?.kind).toBe(
      "processing",
    );
    expect(ingestionState({ ...partial, status: "graphing", error: null }, open)).toEqual({
      kind: "processing",
      label: "Linking ideas",
    });
  });

  it("keeps quota-blocked sources waiting instead of treating them as ready", () => {
    expect(
      ingestionState({ ...partial, error: "Rate limit reached on tokens per day" }, open),
    ).toEqual({ kind: "processing", label: "Waiting for AI quota" });
  });

  it("reads paywalls from file.access, even on an indexed title-only stub", () => {
    expect(ingestionState(indexed, web("paywalled"))).toEqual({ kind: "paywall" });
    expect(ingestionState(undefined, web("paywalled"))).toEqual({ kind: "paywall" });
  });

  it("names the login site from the origin URL's hostname", () => {
    expect(ingestionState(indexed, web("login-required"))).toEqual({
      kind: "login",
      site: "jstor.org",
    });
    expect(
      ingestionState(indexed, { access: "login-required", origin: null, sourceUrl: null }),
    ).toEqual({ kind: "login", site: null });
    expect(
      ingestionState(indexed, {
        access: "login-required",
        origin: null,
        sourceUrl: "https://canvas.school.edu/courses/1",
      }),
    ).toEqual({ kind: "login", site: "canvas.school.edu" });
  });

  it("no longer guesses access from error text", () => {
    const failed = { ...indexed, status: "failed" as const };
    expect(ingestionState({ ...failed, error: "HTTP 403: please log in" }, open)).toEqual({
      kind: "failed",
      reason: "HTTP 403: please log in",
    });
    expect(ingestionState({ ...indexed, error: "subscribe to keep reading" }, open)).toBeNull();
    expect(ingestionState({ ...failed, error: "PDF is encrypted" }, open)).toEqual({
      kind: "password",
    });
  });

  it("shows a re-capture being read, and a paused one as paused, over the old access state", () => {
    expect(ingestionState({ ...indexed, status: "extracting" }, web("paywalled"))).toEqual({
      kind: "processing",
      label: "Reading",
    });
    expect(ingestionState({ ...indexed, status: "paused" }, web("login-required"))).toEqual({
      kind: "paused",
    });
  });
});
