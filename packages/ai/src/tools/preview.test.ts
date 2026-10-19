import { ChatSandboxes } from "@avenire/cloud/chat-sandbox";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { makeWidgetPreview, PreviewResult } from "./preview.ts";
import { pngImage } from "./images.ts";
import { ctx } from "./test-support.ts";

it.effect("local preview preserves action diagnostics and the image transport shape", () =>
  Effect.gen(function* () {
    const image = pngImage(new Uint8Array([137, 80, 78, 71]), {
      id: "initial",
      width: 240,
      height: 120,
    });
    const service = yield* makeWidgetPreview(async (input) => {
      expect(input.width).toBe(240);
      expect(input.appearance).toBe("dark");
      const html = await input.document("http://127.0.0.1:12345");
      expect(html).toContain("color-scheme:dark");
      expect(html).toContain("http://127.0.0.1:12345/kits/");
      return {
        ok: false,
        width: input.width,
        appearance: input.appearance,
        contentHeight: 120,
        overflowX: true,
        screenshots: [{ label: "initial", image }],
        screenshot: image,
        console: [],
        errors: [
          { kind: "exception", message: "Injected click error", afterAction: "Step: click" },
        ],
        interactions: [
          {
            ref: "@e1",
            role: "button",
            name: "Step",
            action: "click",
            changedText: false,
            error: "Injected click error",
          },
        ],
        accessibility: [],
        consoleMessages: [{ level: "uncaught", text: "Injected click error" }],
        summary: "Step throws",
      };
    });
    const result = yield* service.preview(
      {
        html: '<script type="module">import "/kits/math.js";</script><button>Step</button>',
        width: 10,
        appearance: "dark",
      },
      ctx,
    );
    expect(yield* Schema.decodeUnknownEffect(PreviewResult)(result)).toMatchObject({
      ok: false,
      width: 240,
      errors: [{ afterAction: "Step: click" }],
      screenshots: [{ image: { mediaType: "image/png" } }],
      consoleMessages: [{ level: "uncaught" }],
    });
  }).pipe(
    Effect.provideService(
      ChatSandboxes,
      ChatSandboxes.of({
        target: () => Effect.die("unused"),
        exec: () => Effect.die("unused"),
        write: () => Effect.die("unused"),
        read: () => Effect.die("unused"),
        readArtifact: () => Effect.die("unused"),
        close: () => Effect.die("unused"),
        sweep: Effect.die("unused"),
      }),
    ),
  ),
);
