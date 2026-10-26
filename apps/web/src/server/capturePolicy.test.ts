import type { CaptureSnapshot } from "@avenire/contracts";
import { CaptureId } from "@avenire/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { prepareCapture } from "./capturePolicy.ts";
const snapshot: CaptureSnapshot = {
  id: CaptureId.make("capture"),
  capturedAt: "2026-10-26T00:00:00Z",
  deviceId: "device",
  platform: "linux",
  windows: [],
  media: [],
  collectorNotes: [],
  tabs: [
    {
      tabId: 1,
      windowId: 1,
      browser: "chrome",
      url: "https://example.org/article?utm_source=capture",
      title: "Article",
      activeInWindow: true,
      engagement: { dwellMs: 9000, scrollDepthPct: 20, mediaPlaying: false },
      access: "paywalled",
      summary: "The article abstract.",
    },
  ],
};
it.effect(
  "blocked pages follow skip versus metadata-only title-abstract policy and retain origin",
  () =>
    Effect.sync(() => {
      const skipped = prepareCapture(snapshot, () => "hash", "skip");
      expect(skipped.candidates).toEqual([]);
      expect(skipped.skipped).toEqual([
        { title: "Article", reason: "Skipped paywalled page by your capture settings." },
      ]);
      const stub = prepareCapture(snapshot, () => "hash", "title-abstract").candidates[0]!;
      expect(stub).toMatchObject({
        stub: true,
        access: "paywalled",
        summary: "The article abstract.",
        dedupeKey: "url:https://example.org/article",
        origin: { _tag: "Web", url: "https://example.org/article" },
      });
      expect(stub.text).toBeUndefined();
      const login = {
        ...snapshot,
        tabs: [{ ...snapshot.tabs[0]!, access: "login-required" as const }],
      };
      expect(prepareCapture(login, () => "hash", "skip").skipped[0]?.reason).toContain(
        "requiring login",
      );
      const open = { ...snapshot, tabs: [{ ...snapshot.tabs[0]!, access: "open" as const }] };
      expect(prepareCapture(open, () => "hash", "skip").candidates[0]?.stub).toBe(false);
    }),
);
