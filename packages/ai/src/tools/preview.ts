import { ChatSandboxes, CHAT_WORKDIR, type SandboxOwner } from "@avenire/cloud/chat-sandbox";
import { kitsDir } from "@avenire/widget-kit/kits-dir";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { posix } from "node:path";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import { wrapWidget } from "../outputs/widgets.ts";
import { type AgentContext, RuthToolError, toToolError } from "./core.ts";
import { pngImage } from "./images.ts";

const Message = Schema.Struct({
  level: Schema.Literals(["log", "info", "warning", "error", "uncaught"]),
  text: Schema.String,
});
const Diagnostics = Schema.Struct({
  width: Schema.Int,
  contentHeight: Schema.Int,
  consoleMessages: Schema.Array(Message),
});
export const PreviewResult = Schema.Struct({
  ...Diagnostics.fields,
  screenshot: Schema.Struct({
    id: Schema.String,
    data: Schema.String,
    mediaType: Schema.Literal("image/png"),
    sizeBytes: Schema.Int,
    width: Schema.Int,
    height: Schema.Int,
  }),
});
export interface PreviewInput {
  readonly html: string;
  readonly width?: number;
  readonly appearance?: "light" | "dark";
}
const failure = (message: string) =>
  new RuthToolError({ tool: "preview_widget", code: "failed", message, recoverable: true });
const localRead = (path: string) =>
  Effect.tryPromise({
    try: () => readFile(path),
    catch: () =>
      failure(
        "Widget kits could not be read. Build @avenire/widget-kit before starting the server.",
      ),
  });
/** Static runner starts an isolated localhost server, guarantees cleanup and captures page errors as data. */
export const PREVIEW_RUNNER = `import json, functools, threading, sys
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
root = Path(__file__).parent
options = json.loads((root / 'options.json').read_text())
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cross-Origin-Resource-Policy', 'cross-origin')
        if self.path == "/index.html": self.send_header("Content-Security-Policy", "sandbox allow-scripts")
        super().end_headers()
server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(root)))
threading.Thread(target=server.serve_forever, daemon=True).start()
messages = []
def report(level, text):
    if len(messages) < 100: messages.append({'level': level, 'text': str(text).encode('utf-8')[:2000].decode('utf-8', errors='ignore')})
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': options['width'], 'height': 600}, color_scheme=options['appearance'], device_scale_factor=1)
        page.on('console', lambda m: report(m.type if m.type in ('log','info','warning','error') else 'log', m.text))
        page.on('pageerror', lambda e: report('uncaught', e))
        page.goto(f'http://127.0.0.1:{server.server_port}/index.html', wait_until='load', timeout=30000)
        page.wait_for_timeout(1000)
        height = page.evaluate('Math.ceil(Math.max(document.body.scrollHeight, document.body.getBoundingClientRect().height))')
        page.set_viewport_size({'width': options['width'], 'height': max(1, min(height, 20000))})
        # Match the widget frame sandbox: no inherited browser/session capabilities.
        if height > 20000:
            report('warning', 'Content height capped at 20000 px for screenshot budget.')
            page.screenshot(path=str(root/'screenshot.png'), clip={'x':0,'y':0,'width':options['width'],'height':20000}, timeout=30000)
        else: page.screenshot(path=str(root/'screenshot.png'), full_page=True, timeout=30000)
        (root/'diagnostics.json').write_text(json.dumps({'width':options['width'],'contentHeight':height,'consoleMessages':messages}, ensure_ascii=False))
        browser.close()
finally:
    server.shutdown()
    server.server_close()
`;
export class WidgetPreview extends Context.Service<
  WidgetPreview,
  {
    readonly preview: (
      input: PreviewInput,
      ctx: AgentContext,
    ) => Effect.Effect<typeof PreviewResult.Type, RuthToolError>;
  }
>()("avenire/ai/WidgetPreview") {}
export const makeWidgetPreview = Effect.fn("WidgetPreview.make")(function* () {
  const sandboxes = yield* ChatSandboxes;
  const locks = new Map<string, Semaphore.Semaphore>();
  const manifest = yield* localRead(posix.join(kitsDir, "manifest.json"));
  const manifestHash = createHash("sha256").update(manifest).digest("hex");
  const Manifest = Schema.Record(
    Schema.String,
    Schema.Struct({ bytes: Schema.Int, sha256: Schema.String }),
  );
  const parsed = yield* Effect.try({
    try: () => JSON.parse(manifest.toString()) as unknown,
    catch: () => failure("Invalid widget kit manifest."),
  });
  const entries = yield* Schema.decodeUnknownEffect(Manifest)(parsed).pipe(
    Effect.mapError(() => failure("Invalid widget kit manifest.")),
  );
  const files = yield* Effect.forEach(
    Object.entries(entries),
    Effect.fn("WidgetPreview.readKit")(function* ([name, metadata]) {
      if (!/^[a-zA-Z0-9._-]+$/.test(name)) return yield* failure("Invalid widget kit filename.");
      const bytes = yield* localRead(posix.join(kitsDir, name));
      if (
        bytes.byteLength !== metadata.bytes ||
        createHash("sha256").update(bytes).digest("hex") !== metadata.sha256
      )
        return yield* failure("Widget kits do not match their manifest; rebuild kits.");
      return { name, bytes };
    }),
  );
  return WidgetPreview.of({
    preview: (input, ctx) =>
      Effect.suspend(() => {
        if (!ctx.threadId)
          return Effect.fail(
            new RuthToolError({
              tool: "preview_widget",
              code: "invalid_input",
              message: "A thread is required for preview_widget.",
              recoverable: false,
            }),
          );
        const owner: SandboxOwner = { userId: ctx.userId, threadId: ctx.threadId };
        const key = JSON.stringify(owner);
        let lock = locks.get(key);
        if (!lock) {
          lock = Semaphore.makeUnsafe(1);
          locks.set(key, lock);
        }
        return Effect.gen(function* () {
          const width = Math.max(
            240,
            Math.min(1600, Math.round(input.width ?? ctx.page?.contentWidthPx ?? 640)),
          );
          const appearance = input.appearance ?? ctx.page?.colorScheme ?? "light";
          const base = `${CHAT_WORKDIR}/.avenire-preview`;
          const checked = yield* sandboxes.exec(owner, {
            command: `mkdir -p '${base}/kits' && cat '${base}/manifest.sha256' 2>/dev/null || true`,
            timeoutSeconds: 30,
          });
          if (checked.output.trim() !== manifestHash) {
            for (const file of files)
              yield* sandboxes.write(owner, {
                path: `${base}/kits/${file.name}`,
                bytes: file.bytes,
              });
            yield* sandboxes.write(owner, {
              path: `${base}/manifest.sha256`,
              bytes: new TextEncoder().encode(manifestHash),
            });
          }
          // Port is dynamic; 'self' includes exactly this local /kits endpoint during preview.
          const document = yield* wrapWidget(
            ctx,
            { html: input.html, title: "Widget preview" },
            "http://127.0.0.1",
            appearance,
          );
          // The ephemeral server picks its port at runtime, so substitute its origin before navigation.
          const runner = PREVIEW_RUNNER.replace(
            "page.goto(f'http",
            "(root/'index.html').write_text((root/'source.html').read_text().replace('http://127.0.0.1/kits/', f'http://127.0.0.1:{server.server_port}/kits/'))\n        page.goto(f'http",
          );
          for (const [name, text] of [
            ["source.html", document],
            ["options.json", JSON.stringify({ width, appearance })],
            ["preview.py", runner],
          ] as const)
            yield* sandboxes.write(owner, {
              path: `${base}/${name}`,
              bytes: new TextEncoder().encode(text),
            });
          const command = yield* sandboxes.exec(owner, {
            command: `PLAYWRIGHT_BROWSERS_PATH=/opt/avenire/browsers python '${base}/preview.py'`,
            timeoutSeconds: 120,
          });
          if (command.exitCode !== 0)
            return yield* failure(`Preview browser could not run: ${command.output.slice(-2000)}`);
          const json = yield* sandboxes.read(owner, {
            path: `${base}/diagnostics.json`,
            maxBytes: 250_000,
          });
          const decoded = yield* Effect.try({
            try: () => JSON.parse(new TextDecoder().decode(json.bytes)) as unknown,
            catch: () => failure("Preview diagnostics were invalid."),
          });
          const diagnostics = yield* Schema.decodeUnknownEffect(Diagnostics)(decoded).pipe(
            Effect.mapError(() => failure("Preview diagnostics were invalid.")),
          );
          const screenshot = yield* sandboxes.readArtifact(owner, {
            path: `${base}/screenshot.png`,
          });
          return {
            ...diagnostics,
            screenshot: pngImage(screenshot.bytes, {
              id: createHash("sha256").update(screenshot.bytes).digest("hex").slice(0, 24),
              width,
              height:
                screenshot.bytes.byteLength >= 24
                  ? Buffer.from(screenshot.bytes).readUInt32BE(20)
                  : Math.min(diagnostics.contentHeight, 20_000),
            }),
          };
        }).pipe(
          lock.withPermits(1),
          Effect.catchCause((cause) => toToolError("preview_widget", cause)),
        );
      }),
  });
});
export const WidgetPreviewLive = Layer.effect(WidgetPreview, makeWidgetPreview());
