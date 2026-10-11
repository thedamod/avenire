import { ChatSandboxes, type SandboxOwner } from "@avenire/cloud/chat-sandbox";
import { posix } from "node:path";
import type * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import { ArtifactStore, artifactMediaType, safeArtifactName } from "../outputs/artifacts.ts";
import { type AgentContext, RuthToolError, type ToolImpl } from "./core.ts";
import { gatewayTool } from "../cloud/gateway.ts";
import { SANDBOX_TOOL_SPECS } from "./sandbox-specs.ts";

type SandboxServices = ChatSandboxes | ArtifactStore | Crypto.Crypto;
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
  sandbox_exec: Effect.fn("RuthKit.sandboxExec")(function* (input, ctx) {
    const owner = yield* ownerFor("sandbox_exec", ctx);
    const sandboxes = yield* ChatSandboxes;
    return yield* sandboxes.exec(owner, input);
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
    return yield* sandboxes.write(owner, { path: input.path, bytes });
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
  sandbox_download_artifact: Effect.fn("RuthKit.sandboxDownloadArtifact")(function* (input, ctx) {
    const owner = yield* ownerFor("sandbox_download_artifact", ctx);
    const sandboxes = yield* ChatSandboxes;
    const store = yield* ArtifactStore;
    const file = yield* sandboxes.readArtifact(owner, { path: input.path });
    const mediaType = artifactMediaType(file.name);
    // Preserve the extension when a title supplies a friendlier download filename.
    const extension = posix.extname(file.name);
    const title = input.title?.trim();
    const name = safeArtifactName(
      title ? (title.endsWith(extension) ? title : `${title}${extension}`) : file.name,
    );
    const stored = yield* store.put(ctx.userId, { name, bytes: file.bytes, mediaType });
    return {
      artifactId: stored.artifactId,
      name,
      url: stored.url,
      mediaType,
      size: file.bytes.byteLength,
      expiresAt: stored.expiresAt,
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
  sandbox_exec: gatewayTool({
    spec: SANDBOX_TOOL_SPECS.sandbox_exec,
    policy,
    execute: sandboxTools.sandbox_exec,
  }),
  sandbox_write: gatewayTool({
    spec: SANDBOX_TOOL_SPECS.sandbox_write,
    policy,
    execute: sandboxTools.sandbox_write,
  }),
  sandbox_read: gatewayTool({
    spec: SANDBOX_TOOL_SPECS.sandbox_read,
    policy,
    execute: sandboxTools.sandbox_read,
  }),
  sandbox_download_artifact: gatewayTool({
    spec: SANDBOX_TOOL_SPECS.sandbox_download_artifact,
    policy,
    execute: sandboxTools.sandbox_download_artifact,
  }),
  sandbox_close: gatewayTool({
    spec: SANDBOX_TOOL_SPECS.sandbox_close,
    policy,
    execute: sandboxTools.sandbox_close,
  }),
};
