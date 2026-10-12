/**
 * Sends one prompt through Ruth's real chat pipeline (tools, sandbox, assets) as a demo user and
 * saves what came back. Usage:
 *   pnpm --filter @avenire/web ruth:prompt -- --slug gradient-descent [--fast] "prompt text"
 * Outputs land in /tmp/ruth-demo/<slug>/: transcript.json, preview-*.png, widget-*.html.
 */
import { Ruth } from "@avenire/ai/ruth";
import { AssetStore } from "@avenire/ai/outputs/assets";
import { AssetId, UserId } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { user } from "@avenire/database/schema";
import { THEME_TOKENS } from "@avenire/ui/tokens";
import { ChatSandboxes } from "@avenire/cloud/chat-sandbox";
import * as Effect from "effect/Effect";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Option from "effect/Option";
import { mkdir, writeFile } from "node:fs/promises";

import { ServerLive } from "../src/server/runtime.ts";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const flag = (name: string) => {
  const at = args.indexOf(name);
  if (at === -1) return undefined;
  const [, value] = args.splice(at, 2);
  return value;
};
const slug = flag("--slug") ?? "prompt";
const fast = args.includes("--fast");
const prompt = args.filter((arg) => arg !== "--fast").join(" ");
if (!prompt) throw new Error("Pass the prompt text");
const out = `/tmp/ruth-demo/${slug}`;
const DEMO_USER = UserId.make("demo-ruth-user");

const runtime = ManagedRuntime.make(ServerLive);
const transcript: Array<Record<string, unknown>> = [];
let text = "";
let previews = 0;
let threadForCleanup: string | undefined;

const findImages = (value: unknown, found: string[] = []): string[] => {
  if (
    typeof value === "string" &&
    value.length > 2000 &&
    /^[A-Za-z0-9+/=]+$/.test(value.slice(0, 200))
  )
    found.push(value);
  else if (value && typeof value === "object")
    for (const v of Object.values(value)) findImages(v, found);
  return found;
};

try {
  await mkdir(out, { recursive: true });
  const threadId = await runtime.runPromise(
    Effect.gen(function* () {
      const database = yield* Database;
      const now = new Date();
      yield* database.use((db) =>
        db
          .insert(user)
          .values({
            id: DEMO_USER,
            name: "Demo Student",
            email: "demo-ruth@avenire.local",
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing(),
      );
      const ruth = yield* Ruth;
      const thread = yield* ruth.createThread(DEMO_USER, slug);
      return thread.id;
    }),
  );
  threadForCleanup = threadId;
  const started = Date.now();
  const stream = await runtime.runPromise(
    Effect.gen(function* () {
      const ruth = yield* Ruth;
      return yield* ruth.chat({
        userId: DEMO_USER,
        threadId,
        message: { id: `m-${Date.now()}`, role: "user", parts: [{ type: "text", text: prompt }] },
        page: {
          surface: "chat",
          platform: "web",
          contentWidthPx: 720,
          colorScheme: "dark",
          themeTokens: THEME_TOKENS.dark,
          fonts: {
            body: THEME_TOKENS.dark["--font-sans"] ?? "sans-serif",
            mono: THEME_TOKENS.dark["--font-mono"] ?? "monospace",
          },
        },
        fast,
        timeZone: "Asia/Kolkata",
      });
    }),
  );
  for await (const chunk of stream as AsyncIterable<Record<string, unknown>>) {
    const type = String(chunk.type);
    if (type === "text-delta") text += String(chunk.delta ?? "");
    else if (type === "tool-input-available") {
      transcript.push({ at: Date.now() - started, call: chunk.toolName, input: chunk.input });
      process.stdout.write(`→ ${String(chunk.toolName)}\n`);
    } else if (type === "tool-output-available") {
      const images = findImages(chunk.output);
      for (const image of images)
        await writeFile(`${out}/preview-${++previews}.png`, Buffer.from(image, "base64"));
      const output = JSON.parse(
        JSON.stringify(chunk.output, (_k, v) =>
          typeof v === "string" && v.length > 2000 ? `<${v.length} chars>` : v,
        ),
      );
      transcript.push({ at: Date.now() - started, result: chunk.toolCallId, output });
      if (output && typeof output === "object" && "assetId" in output) {
        const html = await runtime.runPromise(
          Effect.gen(function* () {
            const assets = yield* AssetStore;
            const found = yield* assets.get(
              AssetId.make(String((output as { assetId: string }).assetId)),
            );
            if (Option.isNone(found) || found.value.kind !== "widget") return undefined;
            return new TextDecoder().decode(yield* assets.load(found.value));
          }),
        );
        if (html)
          await writeFile(
            `${out}/widget-${String((output as { assetId: string }).assetId)}.html`,
            html,
          );
      }
    } else if (type === "tool-output-error" || type === "error") {
      transcript.push({ at: Date.now() - started, error: chunk });
      process.stdout.write(`! ${JSON.stringify(chunk).slice(0, 300)}\n`);
    }
  }
  transcript.push({ at: Date.now() - started, text });
  await writeFile(`${out}/transcript.json`, JSON.stringify({ prompt, fast, transcript }, null, 2));
  process.stdout.write(
    `\n${text}\n\nSaved to ${out} in ${((Date.now() - started) / 1000).toFixed(1)} s\n`,
  );
} finally {
  // Close this thread's chat sandbox instead of waiting for the hard lifetime cap.
  if (threadForCleanup) {
    const closed = await runtime
      .runPromise(
        Effect.gen(function* () {
          const sandboxes = yield* ChatSandboxes;
          return yield* sandboxes.close({ userId: DEMO_USER, threadId: threadForCleanup! });
        }),
      )
      .catch((error: unknown) => ({ closed: false, error: String(error) }));
    process.stdout.write(`Chat sandbox: ${JSON.stringify(closed)}\n`);
  }
  await runtime.dispose();
}
