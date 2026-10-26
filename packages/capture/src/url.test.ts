import { describe, expect, it } from "vite-plus/test";
import type { CaptureOrigin } from "@avenire/contracts";
import { dedupeKeyFor, normalizeUrl } from "./url.ts";

const web = (url: string): CaptureOrigin => ({
  _tag: "Web",
  url,
  title: "Paper",
  browser: "chrome",
  capturedAt: "2026-10-26T00:00:00Z",
});
describe("URL identity", () => {
  it.each([
    [
      "https://example.com/p?utm_source=a&fbclid=x&gclid=y&mc_cid=z&ref_src=q&id=42#heading",
      "https://example.com/p?id=42",
    ],
    [
      "https://example.com/p?UTM_medium=a&mc_eid=z&ref=keep&si=keep",
      "https://example.com/p?ref=keep&si=keep",
    ],
    ["https://example.com/a.pdf#page=7", "https://example.com/a.pdf#page=7"],
    ["https://vimeo.com/1#t=12.5s", "https://vimeo.com/1#t=12.5s"],
    ["https://example.com/a.pdf#page=7&zoom=100", "https://example.com/a.pdf#page=7&zoom=100"],
    ["https://vimeo.com/1#t=1m30s", "https://vimeo.com/1#t=1m30s"],
    ["broken URL ", "broken URL"],
  ])("normalizes %s", (raw, expected) => expect(normalizeUrl(raw)).toBe(expected));
  it("is idempotent and preserves content parameters", () => {
    const url = "https://example.com/p?file=lecture%202.pdf&utm_source=x&part=2";
    expect(normalizeUrl(normalizeUrl(url))).toBe(normalizeUrl(url));
    expect(normalizeUrl(url)).toContain("part=2");
  });
  it("deduplicates positions and redirects but keeps distinct sources", () => {
    expect(dedupeKeyFor(web("https://example.com/a.pdf#page=1"))).toBe(
      dedupeKeyFor(web("https://example.com/a.pdf#page=8")),
    );
    expect(dedupeKeyFor(web("https://youtu.be/one?t=12s"))).toBe(
      dedupeKeyFor(web("https://youtu.be/one?t=24s")),
    );
    expect(dedupeKeyFor(web("https://example.com/?id=1"))).not.toBe(
      dedupeKeyFor(web("https://example.com/?id=2")),
    );
    expect(
      dedupeKeyFor({
        ...web("https://example.com/redirect"),
        finalUrl: "https://example.com/p?utm_source=x",
      } as CaptureOrigin),
    ).toBe("url:https://example.com/p");
  });
  it("keys local files by content, whichever device or name they came from", () => {
    const local: CaptureOrigin = {
      _tag: "LocalFile",
      deviceId: "a",
      deviceName: "Laptop",
      platform: "win32",
      fileName: "A.pdf",
      sizeBytes: 1,
      sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      capturedAt: "now",
    };
    expect(dedupeKeyFor(local)).toBe(`content:${"a".repeat(64)}`);
    expect(dedupeKeyFor({ ...local, deviceId: "b", fileName: "copy.pdf" })).toBe(
      dedupeKeyFor(local),
    );
  });
  it("drops secret and session query parameters", () => {
    expect(normalizeUrl("https://example.com/f?id=1&token=x&X-Amz-Signature=y&sig=z")).toBe(
      "https://example.com/f?id=1",
    );
  });
});
