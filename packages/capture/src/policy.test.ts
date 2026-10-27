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
      tabId: 1,
      windowId: 1,
      browser: "chrome",
      activeInWindow: true,
      engagement: { dwellMs: 10_000, scrollDepthPct: 20, mediaPlaying: false },
    },
    {
      url: "https://example.com/notes",
      title: "Notes",
      tabId: 1,
      windowId: 1,
      browser: "chrome",
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

it("preserves only declared fields in verified tab provenance", () => {
  const selection = { exact: "Selected text", prefix: "Before", unexpected: "secret" };
  const position = { scrollPct: 20, textQuote: selection, unexpected: "secret" };
  const result = applyPolicy({
    ...snapshot,
    tabs: [{ ...snapshot.tabs[1]!, selection, position }],
  });
  expect(result.snapshot.tabs[0]).toMatchObject({
    tabId: 1,
    windowId: 1,
    browser: "chrome",
    selection: { exact: "Selected text", prefix: "Before" },
    position: { scrollPct: 20, textQuote: { exact: "Selected text", prefix: "Before" } },
  });
  expect(JSON.stringify(result)).not.toContain("secret");
  expect(applyPolicy(result.snapshot).snapshot).toEqual(result.snapshot);
});

it("permits the owner's file URL locally while preserving incognito and blocklist rules", () => {
  const url = "file:///C:/Users/<user>/Downloads/MATH%20U113%20Course%20Handout.pdf";
  const tab = { ...snapshot.tabs[1]!, url };
  const result = applyPolicy({
    ...snapshot,
    tabs: [tab, { ...tab, tabId: 2, incognito: true }, { ...tab, tabId: 3, title: "InPrivate" }],
  });
  expect(result.snapshot.tabs).toEqual([tab]);
  expect(result.blocked.map((entry) => entry.category)).toEqual([
    "private-window",
    "private-window",
  ]);
});
it.each(["Olk.exe", "ms-teams", "KeePassXC", "Spotify", "Mailspring"])(
  "keeps v1's sensitive application alias %s blocked",
  (appName) => {
    const result = applyPolicy({
      ...snapshot,
      tabs: [],
      windows: [{ appName, title: "Private content", foreground: false }],
    });
    expect(result.snapshot.windows).toEqual([]);
    expect(result.blocked).toHaveLength(1);
  },
);

it("matches blocked app variants by whole words, not substrings of study apps", () => {
  const app = (appName: string) =>
    applyPolicy({
      ...snapshot,
      tabs: [],
      media: [],
      windows: [{ appName, title: "Topic", foreground: false }],
    }).blocked.length;
  for (const blocked of [
    "DiscordCanary",
    "slack.exe",
    "WhatsApp.Root",
    "ms-teams",
    "Telegram Desktop",
    "1Password 7",
    "olk",
    "KeePassXC",
    "PayPal",
    "Signal",
    "Messages",
  ])
    expect(app(blocked)).toBe(1);
  for (const allowed of [
    "Purchase Planner",
    "Otherwise Notes",
    "SignalProcessingLab",
    "Pipeline Studio",
    "Acrobat",
  ])
    expect(app(allowed)).toBe(0);
});
