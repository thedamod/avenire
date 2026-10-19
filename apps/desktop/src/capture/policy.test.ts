import { describe, expect, it } from "vite-plus/test";
import { CaptureId } from "@avenire/contracts";
import type { CaptureSnapshot } from "@avenire/contracts";
import { applyPolicy } from "./policy.ts";

const snapshot: CaptureSnapshot = {
  id: CaptureId.make("capture-test"),
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
    expect(result.blocked).toEqual([{ title: "Blocked source", category: "email" }]);
  });
});

it("never delivers clipboard, diagnostics or unverified per-tab selection", () => {
  const secret = "stale-secret-value";
  const result = applyPolicy({
    ...snapshot,
    selectionText: secret,
    collectorNotes: [secret],
    tabs: snapshot.tabs.map((tab) => ({ ...tab, selectionText: secret })),
  });
  expect(JSON.stringify(result)).not.toContain(secret);
  expect(result.snapshot.tabs).toHaveLength(1);
});

it("rejects private, DRM, blocked redirect and unbound media across outbound fields", () => {
  const secret = "private-secret";
  const result = applyPolicy({
    ...snapshot,
    tabs: [
      { ...snapshot.tabs[1]!, title: secret, finalUrl: "https://mail.google.com/inbox" },
      { ...snapshot.tabs[1]!, title: `InPrivate ${secret}` },
    ],
    windows: [
      { appName: "Bitwarden", title: secret, foreground: true },
      { appName: "Browser", title: `https://mail.google.com/${secret}`, foreground: true },
    ],
    media: [
      { appName: "Browser", title: secret },
      { appName: "Netflix", title: secret, url: "https://example.com/video" },
      { appName: "Browser", title: secret, url: "https://mail.google.com/video" },
    ],
  });
  expect(result.snapshot.tabs).toEqual([]);
  expect(result.snapshot.windows).toEqual([]);
  expect(result.snapshot.media).toEqual([]);
  expect(JSON.stringify(result)).not.toContain(secret);
});

it("is idempotent at the renderer/server outbound seam", () => {
  const first = applyPolicy({ ...snapshot, selectionText: "secret" });
  expect(applyPolicy(first.snapshot).snapshot).toEqual(first.snapshot);
});

it("rejects encoded blocked destinations in redirect wrappers", () => {
  const result = applyPolicy({
    ...snapshot,
    tabs: [
      {
        ...snapshot.tabs[1]!,
        url: "https://example.com/redirect?next=https%3A%2F%2Fmail.google.com%2Finbox",
      },
    ],
  });
  expect(result.snapshot.tabs).toEqual([]);
  expect(result.blocked).toEqual([{ title: "Blocked source", category: "email" }]);
});

it("requires media title and app provenance and never attaches an unrelated path", () => {
  const tab = snapshot.tabs[1]!;
  const window = { appName: "Browser", title: tab.title, foreground: true };
  const allowed = { appName: window.appName, title: tab.title, url: tab.url, positionSec: 12 };
  const result = applyPolicy({
    ...snapshot,
    windows: [window],
    media: [
      allowed,
      { ...allowed, title: "unrelated private title" },
      { ...allowed, appName: "unverified app" },
      { ...allowed, filePath: "/private/unrelated.txt" },
    ],
  });
  expect(result.snapshot.media).toEqual([allowed]);
});
