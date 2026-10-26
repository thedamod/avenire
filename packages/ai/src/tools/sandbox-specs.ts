/** Sandbox contracts are client-safe; implementations and storage live in separate modules. */
import { AssetId, AssetKind, WidgetSource } from "@avenire/contracts";
import { tool } from "ai";
import * as Schema from "effect/Schema";
import { standardSchema, standardObjectSchema } from "./schema.ts";
import { PreviewResult } from "./preview/report.ts";

const activity = Schema.optionalKey(
  Schema.String.check(Schema.isMaxLength(96)).annotate({
    description:
      'One short user-facing phrase describing this work, e.g. "Checked the flame controls" or "Built the engine cutaway". No code, paths, skill names or implementation details. Shown only after success.',
  }),
);
const encoding = Schema.Literals(["utf8", "base64"]);
export const sandboxExecSpec = {
  name: "sandbox_exec",
  description:
    "Run a command in the thread's ephemeral Linux box: Python 3.13, scientific stack, manimgx and document tools are preinstalled. Network is blocked; lifetime is capped at 60 minutes. Write a script with sandbox_write, then run it here. For manimgx, inspect then render to a file, then publish_asset.",
  inputSchema: standardObjectSchema(
    Schema.Struct({
      command: Schema.NonEmptyString,
      activity,
      cwd: Schema.optionalKey(Schema.String),
      timeoutSeconds: Schema.optionalKey(
        Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 900 })),
      ),
    }),
  ),
  outputSchema: standardSchema(
    Schema.Struct({
      activity,
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
    "Write a script or data file up to 10 MiB in this thread's sandbox. Use a relative path such as afterburner.html; it resolves under /home/daytona/work. Absolute writes must stay under /home/daytona or /tmp; /mnt and /mnt/data are unavailable. Defaults to UTF-8; use base64 for binary bytes. For large visualizations, write a generator/build script, execute it, then pass the resulting HTML path to preview_widget and render_widget (8 MiB max). Do not send multi-megabyte HTML in tool arguments or read it back into context.",
  inputSchema: standardSchema(
    Schema.Struct({
      path: Schema.NonEmptyString.annotate({
        description:
          "Relative to /home/daytona/work, or an absolute path under /home/daytona or /tmp. Use afterburner.html, not /mnt/afterburner.html.",
      }),
      content: Schema.String,
      activity,
      encoding: Schema.optionalKey(encoding),
    }),
  ),
  outputSchema: standardSchema(Schema.Struct({ path: Schema.String, size: Schema.Int, activity })),
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
export const publishAssetSpec = {
  name: "publish_asset",
  description:
    "Publish a sandbox file (up to 50 MB) as a permanent, private asset. Use for figures, videos and documents. In Cloud, HTML (8 MiB max) is wrapped with the production CSP/theme and published as an interactive widget; use its returned URL in the report.",
  inputSchema: standardSchema(
    Schema.Struct({ path: Schema.NonEmptyString, title: Schema.optionalKey(Schema.String) }),
  ),
  outputSchema: standardSchema(
    Schema.Struct({
      assetId: AssetId,
      kind: AssetKind,
      name: Schema.String,
      url: Schema.String,
      mediaType: Schema.String,
      sizeBytes: Schema.Int,
    }),
  ),
};
export const sandboxCloseSpec = {
  name: "sandbox_close",
  description:
    "Close this thread's sandbox when the task is done, unless waiting for the user's input. After that follow-up, close it.",
  inputSchema: standardObjectSchema(Schema.Struct({})),
  outputSchema: standardSchema(
    Schema.Struct({ closed: Schema.Boolean, lifetimeSeconds: Schema.Number }),
  ),
};
export const previewWidgetSpec = {
  name: "preview_widget",
  description:
    "Pass exactly one of html (512,000 bytes max) or path (built HTML in this thread sandbox, 8 MiB max). Run one isolated local headless agent-browser preview on the chat server (no external sandbox browser). Returns ok, width, appearance, contentHeight, overflowX, rendering diagnostics (Canvas 2D vs WebGL contexts, linked shader programs, draw calls and context losses), labeled screenshots, console, errors with afterAction, interactions, accessibility and a summary. Set requireWebGL:true when verifying a shader: preview fails unless a real WebGL context links a program and submits a draw. Compilation/link/context errors are captured even when widget code swallows them. Exercises up to 25 actions in 20 seconds. Check all screenshots and diagnostics, fix failures in this thread, and preview again before render_widget. Width is clamped to 240–1600; defaults to the chat column/theme. Bundled /kits/*.js are available; other network is blocked. path still reads HTML from the thread sandbox. Never requires approval.",
  inputSchema: standardObjectSchema(
    Schema.Union([
      Schema.Struct({
        ...WidgetSource.members[0].fields,
        activity,
        width: Schema.optionalKey(Schema.Int),
        appearance: Schema.optionalKey(Schema.Literals(["light", "dark"])),
        requireWebGL: Schema.optionalKey(Schema.Boolean),
      }),
      Schema.Struct({
        ...WidgetSource.members[1].fields,
        activity,
        width: Schema.optionalKey(Schema.Int),
        appearance: Schema.optionalKey(Schema.Literals(["light", "dark"])),
        requireWebGL: Schema.optionalKey(Schema.Boolean),
      }),
    ]),
  ),
  outputSchema: standardSchema(PreviewResult),
};
export const SANDBOX_TOOL_SPECS = {
  preview_widget: previewWidgetSpec,
  sandbox_exec: sandboxExecSpec,
  sandbox_write: sandboxWriteSpec,
  sandbox_read: sandboxReadSpec,
  publish_asset: publishAssetSpec,
  sandbox_close: sandboxCloseSpec,
};
export const ruthSandboxSpecs = {
  preview_widget: tool(previewWidgetSpec),
  sandbox_exec: tool(sandboxExecSpec),
  sandbox_write: tool(sandboxWriteSpec),
  sandbox_read: tool(sandboxReadSpec),
  publish_asset: tool(publishAssetSpec),
  sandbox_close: tool(sandboxCloseSpec),
};
