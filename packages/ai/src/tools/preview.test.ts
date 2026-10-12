import { ChatSandboxes, CHAT_WORKDIR, SandboxQuotaExceeded } from "@avenire/cloud/chat-sandbox";
import { ThreadId } from "@avenire/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { makeWidgetPreview, PREVIEW_RUNNER } from "./preview.ts";
import { ctx } from "./test-support.ts";
const turn = { ...ctx, threadId: ThreadId.make("preview-thread") };
const fixture = () => {
  const files = new Map<string, Uint8Array>();
  const owners: unknown[] = [];
  let commands = 0;
  let kitWrites = 0;
  const decoder = new TextDecoder();
  const base = `${CHAT_WORKDIR}/.avenire-preview`;
  const service = ChatSandboxes.of({
    target: () => Effect.die("Unexpected computer target in this test"),
    exec: (owner, input) =>
      Effect.sync(() => {
        owners.push(owner);
        commands++;
        if (input.command.includes("manifest.sha256"))
          return {
            exitCode: 0,
            output: files.has(`${base}/manifest.sha256`)
              ? decoder.decode(files.get(`${base}/manifest.sha256`))
              : "",
            truncated: false,
            durationMs: 1,
          };
        const options = JSON.parse(decoder.decode(files.get(`${base}/options.json`)!)) as {
          width: number;
          appearance: string;
        };
        files.set(
          `${base}/diagnostics.json`,
          new TextEncoder().encode(
            JSON.stringify({
              width: options.width,
              contentHeight: 720,
              consoleMessages: [
                { level: "error", text: "Page error is a result" },
                { level: "uncaught", text: "bad script" },
              ],
            }),
          ),
        );
        files.set(`${base}/screenshot.png`, new Uint8Array([137, 80, 78, 71]));
        return { exitCode: 0, output: "", truncated: false, durationMs: 12 };
      }),
    write: (owner, input) =>
      Effect.sync(() => {
        owners.push(owner);
        files.set(input.path, input.bytes);
        if (input.path.includes("/kits/")) kitWrites++;
        return { path: input.path, size: input.bytes.byteLength };
      }),
    read: (owner, input) =>
      Effect.sync(() => {
        owners.push(owner);
        const bytes = files.get(input.path)!;
        return { path: input.path, bytes, size: bytes.byteLength, truncated: false };
      }),
    readArtifact: (owner, input) =>
      Effect.sync(() => {
        owners.push(owner);
        return { path: input.path, bytes: files.get(input.path)!, name: "screenshot.png" };
      }),
    close: () => Effect.succeed({ closed: true, lifetimeSeconds: 1 }),
    sweep: Effect.succeed(0),
  });
  return { service, files, owners, commands: () => commands, kitWrites: () => kitWrites };
};
it.effect(
  "preview returns page errors and screenshot, clamps width and uploads kits once per sandbox",
  () => {
    const f = fixture();
    return Effect.gen(function* () {
      const previews = yield* makeWidgetPreview();
      const result = yield* previews.preview(
        {
          html: '<script type="module">import {rk4} from "/kits/math.js";</script><p>Figure</p>',
          width: 10,
          appearance: "dark",
        },
        turn,
      );
      expect(result).toMatchObject({
        width: 240,
        contentHeight: 720,
        consoleMessages: [{ level: "error" }, { level: "uncaught" }],
        screenshot: { mediaType: "image/png", sizeBytes: 4, width: 240, height: 720 },
      });
      const uploads = f.kitWrites();
      expect(uploads).toBeGreaterThan(0);
      expect(
        new TextDecoder().decode(f.files.get(`${CHAT_WORKDIR}/.avenire-preview/source.html`)!),
      ).toContain("color-scheme:dark");
      const second = yield* previews.preview({ html: "<p>Second</p>", width: 2000 }, turn);
      expect(second.width).toBe(1600);
      expect(f.kitWrites()).toBe(uploads);
      f.files.delete(`${CHAT_WORKDIR}/.avenire-preview/manifest.sha256`);
      yield* previews.preview({ html: "<p>Recreated sandbox</p>" }, turn);
      expect(f.kitWrites()).toBe(uploads * 2);
      expect(
        f.owners.every(
          (owner) =>
            JSON.stringify(owner) ===
            JSON.stringify({ userId: turn.userId, threadId: turn.threadId }),
        ),
      ).toBe(true);
    }).pipe(Effect.provideService(ChatSandboxes, f.service));
  },
);
it.effect("preview preserves quota errors and requires a thread", () => {
  const f = fixture();
  return Effect.gen(function* () {
    const previews = yield* makeWidgetPreview();
    expect(yield* previews.preview({ html: "ok" }, ctx).pipe(Effect.result)).toMatchObject({
      failure: { code: "invalid_input" },
    });
    expect(yield* previews.preview({ html: "ok" }, turn).pipe(Effect.result)).toMatchObject({
      failure: { code: "quota_exceeded" },
    });
  }).pipe(
    Effect.provideService(ChatSandboxes, {
      ...f.service,
      exec: () => Effect.fail(new SandboxQuotaExceeded({ reason: "daily limit" })),
    }),
  );
});
it.effect("browser infrastructure failures are recoverable tool failures", () => {
  const f = fixture();
  return Effect.gen(function* () {
    const previews = yield* makeWidgetPreview();
    expect(yield* previews.preview({ html: "ok" }, turn).pipe(Effect.result)).toMatchObject({
      failure: { tool: "preview_widget", code: "failed", recoverable: true },
    });
  }).pipe(
    Effect.provideService(ChatSandboxes, {
      ...f.service,
      exec: () =>
        Effect.succeed({
          exitCode: 1,
          output: "Chromium unavailable",
          truncated: false,
          durationMs: 1,
        }),
    }),
  );
});
it("runner caps diagnostics and always shuts down its localhost server", () => {
  expect(PREVIEW_RUNNER).toContain("len(messages) < 100");
  expect(PREVIEW_RUNNER).toContain("[:2000]");
  expect(PREVIEW_RUNNER).toContain("finally:");
  expect(PREVIEW_RUNNER).toContain("server.shutdown()");
});
