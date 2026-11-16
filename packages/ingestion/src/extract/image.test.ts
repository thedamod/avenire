import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { DescribeError, ImageDescriber, ImageDescriberTest } from "./describe.ts";
import { extractImage } from "./image.ts";
import type { SourceInput } from "./types.ts";

const bytes = new Uint8Array([1, 2, 3]);
const source: SourceInput = {
  kind: "image",
  title: "Diagram",
  mimeType: "image/png",
  sourceUrl: null,
  bytes,
};

describe("extractImage", () => {
  it.effect("indexes visible text before the description", () =>
    Effect.gen(function* () {
      const document = yield* extractImage(bytes, source);
      expect(document.sections).toEqual([
        { text: "test visible text", kind: "slide", location: {} },
        {
          text: "Visual description (generated):\ntest image description",
          kind: "figure",
          location: {},
        },
      ]);
      expect(document.coverage.status).toBe("full");
    }).pipe(Effect.provide(ImageDescriberTest)),
  );

  it.effect("reports none when vision fails", () =>
    Effect.gen(function* () {
      const document = yield* extractImage(bytes, source);
      expect(document.sections).toEqual([]);
      expect(document.coverage.status).toBe("none");
    }).pipe(
      Effect.provide(
        Layer.succeed(
          ImageDescriber,
          ImageDescriber.of({
            describe: Effect.fn("ImageDescriber.failTest")(function* () {
              return yield* new DescribeError({ cause: "test" });
            }),
          }),
        ),
      ),
    ),
  );
});

it.effect("retains a capture note and labels coverage as the visible screen", () =>
  Effect.gen(function* () {
    const document = yield* extractImage(bytes, {
      ...source,
      origin: {
        _tag: "Screen",
        captureId: "capture",
        deviceId: "phone",
        deviceName: "Phone",
        platform: "android",
        appPackage: "reader",
        appName: "Reader",
        capturedAt: "2026-11-15T00:00:00Z",
        sha256: "a".repeat(64),
        sizeBytes: bytes.length,
        scope: "visible-screen",
        note: "Review this equation",
      },
    });
    expect(
      document.sections.some((section) => section.text === "Capture note:\nReview this equation"),
    ).toBe(true);
    expect(document.coverage.parts).toMatchObject([
      { part: "visible-screen", detail: expect.stringContaining("not the entire") },
    ]);
    expect(document.sections.find((section) => section.kind === "slide")?.text).not.toContain(
      "description",
    );
  }).pipe(Effect.provide(ImageDescriberTest)),
);
