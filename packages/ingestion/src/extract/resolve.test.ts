import { describe, expect, it } from "@effect/vitest";

import { resolveFormat } from "./resolve.ts";
import type { SourceInput } from "./types.ts";

const bytesOf = (text: string, prefix: ReadonlyArray<number> = []) =>
  new Uint8Array([...prefix, ...new TextEncoder().encode(text)]);

const source = (overrides: Partial<SourceInput>): SourceInput => ({
  kind: "note",
  title: "Untitled",
  mimeType: null,
  sourceUrl: null,
  bytes: null,
  ...overrides,
});

describe("resolveFormat", () => {
  it("trusts file signatures over the declared kind", () => {
    const mp4 = bytesOf("ftypisom", [0, 0, 0, 0x20]);
    expect(resolveFormat(source({ kind: "note", bytes: mp4 }))).toBe("media");
    expect(resolveFormat(source({ kind: "document", bytes: bytesOf("%PDF-1.7") }))).toBe("pdf");
    expect(resolveFormat(source({ bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) }))).toBe(
      "image",
    );
  });

  it("needs an office MIME type for zip files", () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    expect(resolveFormat(source({ kind: "document", bytes: zip }))).toBeUndefined();
    expect(
      resolveFormat(
        source({
          kind: "document",
          bytes: zip,
          mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        }),
      ),
    ).toBe("office");
  });

  it("treats notes and text MIME types as text, HTML as a page snapshot", () => {
    expect(resolveFormat(source({ bytes: bytesOf("# Notes") }))).toBe("text");
    expect(
      resolveFormat(source({ kind: "pdf", bytes: bytesOf("x"), mimeType: "text/markdown" })),
    ).toBe("text");
    expect(
      resolveFormat(source({ kind: "web-page", bytes: bytesOf("<html>"), mimeType: "text/html" })),
    ).toBe("html");
  });

  it("routes URLs without stored bytes", () => {
    expect(resolveFormat(source({ kind: "video", sourceUrl: "https://youtu.be/abc" }))).toBe(
      "youtube",
    );
    expect(resolveFormat(source({ kind: "web-page", sourceUrl: "https://example.com" }))).toBe(
      "web",
    );
    expect(
      resolveFormat(source({ kind: "video", sourceUrl: "https://example.com/a.mp4" })),
    ).toBeUndefined();
  });
});
