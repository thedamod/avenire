import { expect, it } from "vite-plus/test";
import { CaptureId, type CaptureSnapshot, type CapturedTab } from "@avenire/contracts";
import { captureCandidates } from "./candidates.ts";

const tab: CapturedTab = {
  tabId: 1,
  windowId: 1,
  browser: "chrome",
  url: "https://study.test/lecture?id=1&utm_source=x",
  title: "Lecture",
  activeInWindow: true,
  engagement: { dwellMs: 0, scrollDepthPct: 0, mediaPlaying: false },
};
const snapshot: CaptureSnapshot = {
  id: CaptureId.make("capture"),
  capturedAt: "now",
  deviceId: "device",
  platform: "linux",
  tabs: [tab],
  windows: [],
  media: [],
  collectorNotes: [],
};
const hash = (text: string) => `hash-of-${text}`;
it("preserves source queries, identity, browser and position across policy", () => {
  const result = captureCandidates(
    { ...snapshot, tabs: [{ ...tab, position: { pdfPage: 2, scrollPct: 40 } }] },
    hash,
  );
  expect(result.candidates[0]).toMatchObject({
    url: "https://study.test/lecture?id=1",
    dedupeKey: "url:https://study.test/lecture?id=1",
    origin: {
      _tag: "Web",
      browser: "chrome",
      capturedAt: "now",
      position: { pdfPage: 2, scrollPct: 40 },
    },
  });
});
it("deduplicates tracked URLs and retains idle tabs across every window", () => {
  const tabs = [
    tab,
    { ...tab, tabId: 2, url: `${tab.url}&fbclid=second` },
    ...[
      { dwellMs: 7999, scrollDepthPct: 14, mediaPlaying: false },
      { dwellMs: 8000, scrollDepthPct: 0, mediaPlaying: false },
      { dwellMs: 0, scrollDepthPct: 15, mediaPlaying: false },
      { dwellMs: 0, scrollDepthPct: 0, mediaPlaying: true },
    ].map((engagement, i) => ({
      ...tab,
      tabId: i + 3,
      url: `https://study.test/${i}`,
      activeInWindow: false,
      engagement,
    })),
  ];
  const result = captureCandidates({ ...snapshot, tabs }, hash);
  expect(result.candidates).toHaveLength(5);
  expect(result.skipped).toEqual([]);
});
it("keys verified selections by source and injected hash, omitting legacy clipboard text", () => {
  const result = captureCandidates(
    {
      ...snapshot,
      selectionText: "secret",
      tabs: [
        {
          ...tab,
          selectionText: "legacy secret",
          selection: { exact: "Chosen text", prefix: "Before" },
        },
        { ...tab, url: "https://study.test/other", selection: { exact: "Chosen text" } },
      ],
    },
    hash,
  );
  const selections = result.candidates.filter((candidate) => candidate.kind === "selection");
  expect(selections).toHaveLength(2);
  expect(selections[0]).toMatchObject({
    text: "Chosen text",
    origin: { position: { textQuote: { exact: "Chosen text", prefix: "Before" } } },
  });
  expect(selections[0]?.dedupeKey).toContain("hash-of-Chosen text");
  expect(selections[0]?.dedupeKey).not.toBe(selections[1]?.dedupeKey);
  expect(JSON.stringify(result)).not.toContain("secret");
});
it("merges media position into the page candidate and leaves local reads to native uploads", () => {
  const result = captureCandidates(
    {
      ...snapshot,
      windows: [
        { appName: "Chrome", title: tab.title, foreground: true },
        { appName: "Preview", title: "Local paper", filePath: "/tmp/paper.pdf", foreground: false },
      ],
      media: [{ appName: "Chrome", title: tab.title, url: tab.url, positionSec: 12 }],
    },
    hash,
  );
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0]).toMatchObject({
    kind: "video",
    position: 12,
    origin: { position: { mediaSec: 12 } },
  });
  expect(result.skipped[0]?.reason).toBe("Upload this local file to capture its contents");
});
it("filters blocked sources before hashing selections or exposing titles", () => {
  const result = captureCandidates(
    {
      ...snapshot,
      tabs: [
        {
          ...tab,
          url: "https://mail.google.com/inbox",
          title: "secret",
          selection: { exact: "secret" },
        },
      ],
    },
    () => {
      throw new Error("must not hash private text");
    },
  );
  expect(result.candidates).toEqual([]);
  expect(JSON.stringify(result)).not.toContain("secret");
});
it("never turns a local file tab into a server URL candidate", () => {
  const local = {
    ...tab,
    url: "file:///C:/Users/<user>/Downloads/MATH%20U113%20Course%20Handout.pdf",
    activeInWindow: false,
  };
  expect(captureCandidates({ ...snapshot, tabs: [local] }, hash).candidates).toEqual([]);
});
