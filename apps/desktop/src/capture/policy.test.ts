import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { CaptureId } from "@avenire/contracts";
import type { CaptureSnapshot } from "@avenire/contracts";
import { applyPolicy } from "./policy.ts";

const snapshot: CaptureSnapshot = {
  id: Schema.decodeUnknownSync(CaptureId)("capture-test"),
  capturedAt: "2026-01-01T00:00:00.000Z",
  deviceId: "device",
  platform: "linux",
  windows: [],
  tabs: [
    {
      url: "https://mail.google.com",
      title: "Inbox",
      activeInWindow: true,
      engagement: { dwellMs: 10_000, scrollDepthPct: 20, mediaPlaying: false },
    },
    {
      url: "https://example.com/notes",
      title: "Notes",
      activeInWindow: true,
      engagement: { dwellMs: 10_000, scrollDepthPct: 20, mediaPlaying: false },
    },
  ],
  media: [],
  collectorNotes: [],
};

describe("applyPolicy", () => {
  it("removes blocked tabs and reports their category", () => {
    const result = applyPolicy(snapshot);
    expect(result.snapshot.tabs).toHaveLength(1);
    expect(result.snapshot.tabs[0]?.title).toBe("Notes");
    expect(result.blocked).toEqual([{ title: "Inbox", category: "email" }]);
  });
});
