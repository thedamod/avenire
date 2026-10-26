import { expect, it } from "vite-plus/test";
import { FileId, type CaptureOrigin } from "@avenire/contracts";
import { mediaTimeUrl, pdfPageUrl, planReopen, textFragmentUrl } from "./reopen.ts";

const context = { fileId: FileId.make("file"), extension: true, desktop: true, deviceId: "device" };
const web: CaptureOrigin = {
  _tag: "Web",
  url: "https://example.com/p?utm_source=x",
  title: "Paper",
  browser: "firefox",
  capturedAt: "now",
  position: { pdfPage: 4, scrollPct: 30 },
};
const local: CaptureOrigin = {
  _tag: "LocalFile",
  deviceId: "device",
  deviceName: "Laptop",
  platform: "linux",
  fileName: "Paper.pdf",
  sizeBytes: 10,
  sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  capturedAt: "now",
  appName: "Preview",
  position: { pdfPage: 4 },
};
it("orders web plans by executable surface, retaining position in the library fallback", () => {
  expect(planReopen(web, context)).toEqual([
    { _tag: "FocusTab", url: "https://example.com/p", position: web.position },
    { _tag: "OpenUrl", url: "https://example.com/p#page=4" },
    { _tag: "OpenInLibrary", fileId: context.fileId, position: web.position },
  ]);
  expect(
    planReopen(web, { ...context, extension: false, desktop: false }).map((plan) => plan._tag),
  ).toEqual(["OpenUrl", "OpenInLibrary"]);
});
it("only opens local files on the same device through desktop", () => {
  expect(planReopen(local, context)[0]).toEqual({
    _tag: "OpenLocal",
    fileId: context.fileId,
    fileName: "Paper.pdf",
    appName: "Preview",
    position: local.position,
  });
  const { deviceId: _, ...withoutDevice } = context;
  for (const options of [
    { ...context, deviceId: "another" },
    { ...context, desktop: false },
    withoutDevice,
  ]) {
    expect(planReopen(local, options).map((plan) => plan._tag)).toEqual(["OpenInLibrary"]);
  }
  expect(planReopen(null, context)).toEqual([{ _tag: "OpenInLibrary", fileId: context.fileId }]);
});
it("encodes text-fragment delimiters, prefix and suffix independently", () => {
  expect(
    textFragmentUrl("https://example.com/a#old", {
      exact: "a,b & c-d",
      prefix: "pre-fix",
      suffix: "after, this",
    }),
  ).toBe("https://example.com/a#:~:text=pre%2Dfix-,a%2Cb%20%26%20c%2Dd,-after%2C%20this");
  expect(pdfPageUrl("https://example.com/a.pdf?q=x", 3)).toBe(
    "https://example.com/a.pdf?q=x#page=3",
  );
});
it.each([
  ["https://www.youtube.com/watch?v=abc&start=2#old", "https://www.youtube.com/watch?v=abc&t=12s"],
  ["https://youtu.be/abc", "https://youtu.be/abc?t=12s"],
  ["https://vimeo.com/123", "https://vimeo.com/123#t=12.5s"],
  ["https://www.loom.com/share/abc?sid=x", "https://www.loom.com/share/abc?sid=x&t=12.5"],
  ["https://evilyoutube.com/a", "https://evilyoutube.com/a"],
])("builds media position for %s", (url, expected) =>
  expect(mediaTimeUrl(url, 12.5)).toBe(expected),
);
it("never proposes an external executable scheme or URL credentials", () => {
  for (const url of [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "https://user:secret@example.com",
  ]) {
    expect(planReopen({ ...web, url }, context).map((plan) => plan._tag)).toEqual([
      "OpenInLibrary",
    ]);
  }
});
