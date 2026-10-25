import { ChatSandboxes, SandboxUnavailable } from "@avenire/cloud/chat-sandbox";
import { ThreadId } from "@avenire/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";
import { makeWidgetPreview, PreviewResult } from "./preview.ts";
import { pngImage } from "./images.ts";
import { ctx } from "./test-support.ts";

const unused = () => Effect.die("unused");
const sandboxes = ChatSandboxes.of({
  target: unused,
  exec: unused,
  write: unused,
  read: unused,
  readArtifact: unused,
  close: unused,
  sweep: unused(),
});

for (const transferSeconds of [65, 125])
  it.effect(`gives a ${transferSeconds}s sandbox transfer its own bounded budget`, () => {
    let calls = 0;
    return Effect.gen(function* () {
      const service = yield* makeWidgetPreview(async (input) => {
        calls++;
        return {
          ok: true,
          width: input.width,
          appearance: input.appearance,
          contentHeight: 10,
          overflowX: false,
          screenshots: [],
          console: [],
          errors: [],
          interactions: [],
          accessibility: [],
          consoleMessages: [],
          summary: "Passed",
        };
      });
      const task = yield* Effect.forkChild(
        service
          .preview({ path: "widget.html" }, { ...ctx, threadId: ThreadId.make("thread") })
          .pipe(Effect.result),
      );
      yield* TestClock.adjust(`${transferSeconds + 1} seconds`);
      const result = yield* Fiber.join(task);
      expect(calls).toBe(transferSeconds < 120 ? 1 : 0);
      if (transferSeconds < 120) expect(result).toMatchObject({ success: { ok: true } });
      else
        expect(result).toMatchObject({
          failure: {
            code: "timeout",
            message:
              "Reading the widget HTML from the sandbox timed out. Try preview_widget again.",
          },
        });
    }).pipe(
      Effect.provideService(ChatSandboxes, {
        ...sandboxes,
        readArtifact: () =>
          Effect.succeed({
            path: "widget.html",
            name: "widget.html",
            bytes: Buffer.from("<p>Test</p>"),
          }).pipe(Effect.delay(`${transferSeconds} seconds`)),
      }),
    );
  });

it.effect("keeps sandbox unavailability distinct from widget path and size errors", () =>
  Effect.gen(function* () {
    const service = yield* makeWidgetPreview(async () => {
      throw new Error("Runner should not start");
    });
    const result = yield* service
      .preview({ path: "widget.html" }, { ...ctx, threadId: ThreadId.make("thread") })
      .pipe(Effect.result);
    expect(result).toMatchObject({ failure: { code: "sandbox_unavailable" } });
  }).pipe(
    Effect.provideService(ChatSandboxes, {
      ...sandboxes,
      readArtifact: () =>
        Effect.fail(new SandboxUnavailable({ detail: "starting the existing sandbox failed" })),
    }),
  ),
);

it.effect("reports the browser timeout stage without echoing raw runner output", () =>
  Effect.gen(function* () {
    const service = yield* makeWidgetPreview(async () => {
      throw new Error("agent-browser open: timed out private source");
    });
    const result = yield* service.preview({ html: "<p>Test</p>" }, ctx).pipe(Effect.result);
    expect(result).toMatchObject({
      failure: {
        code: "timeout",
        message: "The widget preview browser timed out during open. Try preview_widget again.",
      },
    });
    expect(JSON.stringify(result)).not.toContain("private source");
  }).pipe(Effect.provideService(ChatSandboxes, sandboxes)),
);

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
