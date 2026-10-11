/** Sandbox contracts are client-safe; implementations and storage live in separate modules. */
import { ArtifactId } from "@avenire/contracts";
import { tool } from "ai";
import * as Schema from "effect/Schema";
import { standardSchema } from "./schema.ts";

const encoding = Schema.Literals(["utf8", "base64"]);
export const sandboxExecSpec = {
  name: "sandbox_exec",
  description:
    "Run a command in the thread's ephemeral Linux box: Python 3.12, scientific stack, Manim, ffmpeg and LaTeX are preinstalled. Network is blocked; lifetime is capped at 60 minutes. Write a script with sandbox_write, then run it here. For Manim, render with manim -ql to a file, then sandbox_download_artifact.",
  inputSchema: standardSchema(
    Schema.Struct({
      command: Schema.NonEmptyString,
      cwd: Schema.optionalKey(Schema.String),
      timeoutSeconds: Schema.optionalKey(
        Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 900 })),
      ),
    }),
  ),
  outputSchema: standardSchema(
    Schema.Struct({
      exitCode: Schema.Int,
      output: Schema.String,
      truncated: Schema.Boolean,
      durationMs: Schema.Number,
    }),
  ),
};
export const sandboxWriteSpec = {
  name: "sandbox_write",
  description:
    "Write a script or data file in this thread's sandbox. Defaults to UTF-8; use base64 for binary bytes.",
  inputSchema: standardSchema(
    Schema.Struct({
      path: Schema.NonEmptyString,
      content: Schema.String,
      encoding: Schema.optionalKey(encoding),
    }),
  ),
  outputSchema: standardSchema(Schema.Struct({ path: Schema.String, size: Schema.Int })),
};
export const sandboxReadSpec = {
  name: "sandbox_read",
  description:
    "Read a sandbox file, up to 1 MB. Defaults to UTF-8; use base64 for binary files. Use sandbox_exec for head, tail or grep on larger files.",
  inputSchema: standardSchema(
    Schema.Struct({
      path: Schema.NonEmptyString,
      maxBytes: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
      encoding: Schema.optionalKey(encoding),
    }),
  ),
  outputSchema: standardSchema(
    Schema.Struct({
      path: Schema.String,
      content: Schema.String,
      encoding,
      size: Schema.Int,
      truncated: Schema.Boolean,
    }),
  ),
};
export const sandboxDownloadArtifactSpec = {
  name: "sandbox_download_artifact",
  description:
    "Publish a sandbox file (up to 50 MB) as a signed download lasting seven days. Use for figures, videos and documents.",
  inputSchema: standardSchema(
    Schema.Struct({ path: Schema.NonEmptyString, title: Schema.optionalKey(Schema.String) }),
  ),
  outputSchema: standardSchema(
    Schema.Struct({
      artifactId: ArtifactId,
      name: Schema.String,
      url: Schema.String,
      mediaType: Schema.String,
      size: Schema.Int,
      expiresAt: Schema.String,
    }),
  ),
};
export const sandboxCloseSpec = {
  name: "sandbox_close",
  description:
    "Close this thread's sandbox when the task is done, unless waiting for the user's input. After that follow-up, close it.",
  inputSchema: standardSchema(Schema.Struct({})),
  outputSchema: standardSchema(
    Schema.Struct({ closed: Schema.Boolean, lifetimeSeconds: Schema.Number }),
  ),
};
export const SANDBOX_TOOL_SPECS = {
  sandbox_exec: sandboxExecSpec,
  sandbox_write: sandboxWriteSpec,
  sandbox_read: sandboxReadSpec,
  sandbox_download_artifact: sandboxDownloadArtifactSpec,
  sandbox_close: sandboxCloseSpec,
};
export const ruthSandboxSpecs = {
  sandbox_exec: tool(sandboxExecSpec),
  sandbox_write: tool(sandboxWriteSpec),
  sandbox_read: tool(sandboxReadSpec),
  sandbox_download_artifact: tool(sandboxDownloadArtifactSpec),
  sandbox_close: tool(sandboxCloseSpec),
};
