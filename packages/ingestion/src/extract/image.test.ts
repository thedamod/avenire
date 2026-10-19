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
        { text: "test visible text\n\ntest image description", kind: "figure", location: {} },
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
