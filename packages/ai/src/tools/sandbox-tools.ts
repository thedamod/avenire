import { CloudBoxes } from "@avenire/cloud/cloud-box";
import * as Option from "effect/Option";
import { stableToolId } from "../cloud/journal.ts";
import { AssetId } from "@avenire/contracts";
import { ChatSandboxes, type SandboxOwner } from "@avenire/cloud/chat-sandbox";
import { posix } from "node:path";
import type * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import { AssetStore, assetMediaType, safeAssetName } from "../outputs/assets.ts";
import { type AgentContext, RuthToolError, type ToolImpl } from "./core.ts";
import { registerTool } from "./registration.ts";
import { SANDBOX_TOOL_SPECS } from "./sandbox-specs.ts";

import { WidgetPreview } from "./preview.ts";

type SandboxServices = CloudBoxes | WidgetPreview | ChatSandboxes | AssetStore | Crypto.Crypto;
type SandboxImpls = {
  [K in keyof typeof SANDBOX_TOOL_SPECS]: ToolImpl<
    (typeof SANDBOX_TOOL_SPECS)[K]["inputSchema"]["Type"],
    (typeof SANDBOX_TOOL_SPECS)[K]["outputSchema"]["Type"],
    SandboxServices
  >;
};
const ownerFor = (tool: string, ctx: AgentContext): Effect.Effect<SandboxOwner, RuthToolError> =>
  ctx.threadId
    ? Effect.succeed({ userId: ctx.userId, threadId: ctx.threadId })
    : Effect.fail(
        new RuthToolError({
          tool,
          code: "invalid_input",
          message: "A thread is required for sandbox tools.",
          recoverable: false,
        }),
      );

export const sandboxTools: SandboxImpls = {
  preview_widget: Effect.fn("RuthKit.previewWidget")(function* (input, ctx) {
    const previews = yield* WidgetPreview;
    const result = yield* previews.preview(input, ctx);
    return { ...result, ...(result.ok && input.activity ? { activity: input.activity } : {}) };
  }),
  sandbox_exec: Effect.fn("RuthKit.sandboxExec")(function* (input, ctx) {
    const owner = yield* ownerFor("sandbox_exec", ctx);
    const sandboxes = yield* ChatSandboxes;
    const result = yield* sandboxes.exec(owner, input);
    return {
      ...result,
      ...(result.exitCode === 0 && input.activity ? { activity: input.activity } : {}),
    };
  }),
  sandbox_write: Effect.fn("RuthKit.sandboxWrite")(function* (input, ctx) {
    const owner = yield* ownerFor("sandbox_write", ctx);
    const sandboxes = yield* ChatSandboxes;
    if (
      input.encoding === "base64" &&
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.content)
    )
      return yield* new RuthToolError({
        tool: "sandbox_write",
        code: "invalid_input",
        message: "content must be valid base64 for binary files.",
        recoverable: true,
      });
    const bytes =
      input.encoding === "base64"
        ? new Uint8Array(Buffer.from(input.content, "base64"))
        : new TextEncoder().encode(input.content);
    const result = yield* sandboxes.write(owner, { path: input.path, bytes });
    return { ...result, ...(input.activity ? { activity: input.activity } : {}) };
  }),
  sandbox_read: Effect.fn("RuthKit.sandboxRead")(function* (input, ctx) {
    const owner = yield* ownerFor("sandbox_read", ctx);
    const sandboxes = yield* ChatSandboxes;
    const result = yield* sandboxes.read(owner, {
      path: input.path,
      ...(input.maxBytes === undefined ? {} : { maxBytes: input.maxBytes }),
    });
    const encoding = input.encoding ?? "utf8";
    return {
      path: result.path,
      content:
        encoding === "base64"
          ? Buffer.from(result.bytes).toString("base64")
          : new TextDecoder().decode(result.bytes),
      encoding,
      size: result.size,
      truncated: result.truncated,
    };
  }),
  publish_asset: Effect.fn("RuthKit.publishAsset")(function* (input, ctx) {
    const store = yield* AssetStore;
    let file: { name: string; bytes: Uint8Array };
    if (ctx.agent === "ruth-cloud") {
      const box = yield* (yield* CloudBoxes).running(ctx.userId);
      const path = posix.resolve("/home/daytona/workspace", input.path);
      if (!path.startsWith("/home/daytona/workspace/") || path.includes("\0") || Option.isNone(box))
        return yield* new RuthToolError({
          tool: "publish_asset",
          code: "invalid_input",
          message: "Publish a file in the running Cloud workspace.",
          recoverable: true,
        });
      file = { name: posix.basename(path), bytes: yield* box.value.readFile(path) };
    } else {
      const owner = yield* ownerFor("publish_asset", ctx);
      file = yield* (yield* ChatSandboxes).readArtifact(owner, { path: input.path });
    }
    if (file.bytes.byteLength > 50 * 1024 * 1024)
      return yield* new RuthToolError({
        tool: "publish_asset",
        code: "quota_exceeded",
        message: "Publish an asset no larger than 50 MiB.",
        recoverable: true,
      });
    const mediaType = assetMediaType(file.name);
    // Preserve the extension when a title supplies a friendlier download filename.
    const extension = posix.extname(file.name);
    // A title is prose, not a path: "dQ_rev / T" must not become the file name "T)".
    const title = input.title?.trim().replace(/[\\/]+/g, "-");
    const name = safeAssetName(
      title ? (title.endsWith(extension) ? title : `${title}${extension}`) : file.name,
    );
    const stored = yield* store.put(ctx.userId, {
      name,
      title: input.title ?? name,
      bytes: file.bytes,
      mediaType,
      ...(ctx.threadId ? { threadId: ctx.threadId } : {}),
      ...(ctx.runId ? { runId: ctx.runId } : {}),
      ...(ctx.toolCallId && ctx.runId
        ? { idempotencyId: AssetId.make(stableToolId(ctx, "asset")) }
        : {}),
    });
    return {
      assetId: stored.id,
      kind: stored.kind,
      name,
      url: stored.url,
      mediaType,
      sizeBytes: file.bytes.byteLength,
    };
  }),
  sandbox_close: Effect.fn("RuthKit.sandboxClose")(function* (_input, ctx) {
    const owner = yield* ownerFor("sandbox_close", ctx);
    const sandboxes = yield* ChatSandboxes;
    return yield* sandboxes.close(owner);
  }),
};
const policy = { agents: ["ruth"], approval: "never" } as const;
export const sandboxToolRegistry = {
  preview_widget: registerTool({
    spec: SANDBOX_TOOL_SPECS.preview_widget,
    policy,
    execute: sandboxTools.preview_widget,
  }),
  sandbox_exec: registerTool({
    spec: SANDBOX_TOOL_SPECS.sandbox_exec,
    policy,
    execute: sandboxTools.sandbox_exec,
  }),
  sandbox_write: registerTool({
    spec: SANDBOX_TOOL_SPECS.sandbox_write,
    policy,
    execute: sandboxTools.sandbox_write,
  }),
  sandbox_read: registerTool({
    spec: SANDBOX_TOOL_SPECS.sandbox_read,
    policy,
    execute: sandboxTools.sandbox_read,
  }),
  publish_asset: registerTool({
    spec: SANDBOX_TOOL_SPECS.publish_asset,
    policy: { ...policy, agents: ["ruth", "ruth-cloud"] },
    execute: sandboxTools.publish_asset,
  }),
  sandbox_close: registerTool({
    spec: SANDBOX_TOOL_SPECS.sandbox_close,
    policy,
    execute: sandboxTools.sandbox_close,
  }),
};
