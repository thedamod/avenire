import { expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import {
  CaptureOrigin,
  CapturePosition,
  CapturedTab,
  ExtensionMessage,
  TextQuote,
} from "@avenire/contracts";

it("bounds position, text quotes and browser tab identities", () => {
  for (const invalid of [
    { scrollPct: -1 },
    { scrollPct: 101 },
    { mediaSec: -1 },
    { mediaSec: Infinity },
    { pdfPage: 0 },
    { pdfPage: 1.5 },
  ])
    expect(Schema.is(CapturePosition)(invalid)).toBe(false);
  expect(Schema.is(CapturePosition)({ scrollPct: 100, mediaSec: 0, pdfPage: 1 })).toBe(true);
  expect(Schema.is(TextQuote)({ exact: "x".repeat(501) })).toBe(false);
  expect(Schema.is(TextQuote)({ exact: "ok", prefix: "x".repeat(501) })).toBe(false);
  expect(
    Schema.is(CapturedTab)({
      tabId: -1,
      windowId: 0,
      browser: "chrome",
      url: "https://example.com",
      title: "x",
      activeInWindow: true,
      engagement: { dwellMs: 0, scrollDepthPct: 0, mediaPlaying: false },
    }),
  ).toBe(false);
  expect(
    Schema.is(CaptureOrigin)({
      _tag: "LocalFile",
      deviceId: "x",
      deviceName: "Laptop",
      platform: "linux",
      fileName: "a.pdf",
      sizeBytes: -1,
      sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      capturedAt: "now",
    }),
  ).toBe(false);
});
it("requires version 1 on every extension message", () => {
  const messages = [
    {
      _tag: "Hello",
      senderId: "sender",
      browser: "chrome",
      extensionVersion: "1.0.0",
      auth: { _tag: "Code", code: "123456" },
    },
    { _tag: "TabsReport", tabs: [] },
    { _tag: "CaptureRequest", requestId: "request", tabIds: [1], readInBrowser: true },
    { _tag: "CaptureResult", requestId: "request", pages: [], skipped: [] },
    { _tag: "Reopen", requestId: "request", url: "https://example.com" },
    { _tag: "ReopenResult", requestId: "request", ok: true },
    { _tag: "Ping" },
    { _tag: "Pong" },
  ];
  for (const message of messages) {
    expect(Schema.is(ExtensionMessage)({ ...message, version: 1 })).toBe(true);
    expect(Schema.is(ExtensionMessage)({ ...message, version: 2 })).toBe(false);
    expect(Schema.is(ExtensionMessage)(message)).toBe(false);
  }
});
