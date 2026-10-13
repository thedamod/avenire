/** Sandbox contracts are client-safe; implementations and storage live in separate modules. */
import { AssetId, AssetKind, WidgetSource } from "@avenire/contracts";
import { tool } from "ai";
import * as Schema from "effect/Schema";
import { standardSchema, standardObjectSchema } from "./schema.ts";
import { PreviewResult } from "./preview/report.ts";

const encoding = Schema.Literals(["utf8", "base64"]);
export const sandboxExecSpec = {
  name: "sandbox_exec",
  description:
    "Run a command in the thread's ephemeral Linux box: Python 3.13, scientific stack, manimgx and document tools are preinstalled. Network is blocked; lifetime is capped at 120 minutes. Write a script with sandbox_write, then run it here. For manimgx, inspect then render to a file, then publish_asset.",
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
export const publishAssetSpec = {
  name: "publish_asset",
  description:
    "Publish a sandbox file (up to 50 MB) as a permanent, private asset. Use for figures, videos and documents.",
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
  inputSchema: standardSchema(Schema.Struct({})),
  outputSchema: standardSchema(
    Schema.Struct({ closed: Schema.Boolean, lifetimeSeconds: Schema.Number }),
  ),
};
export const previewWidgetSpec = {
  name: "preview_widget",
  description:
    "Pass exactly one of html (512,000 bytes max) or path (built HTML in this thread sandbox, 8 MiB max). Run one isolated local headless agent-browser preview on the chat server (no external sandbox browser). Returns ok, width, appearance, contentHeight, overflowX, labeled screenshots (pixel regions of the attached contact sheet), console, errors with afterAction, interactions with changedText/error, accessibility and a plain-text summary. Exercises up to 25 actions in 20 seconds: buttons, input min/mid/max, select options, toggles, text and detectable figure drags. Check all screenshots and diagnostics, fix failures in this thread, and preview again before render_widget. Width is clamped to 240–1600; defaults to the chat column/theme. Bundled /kits/*.js are available; other network is blocked. path still reads HTML from the thread sandbox. Never requires approval.",
  inputSchema: standardObjectSchema(
    Schema.Union([
      Schema.Struct({
        ...WidgetSource.members[0].fields,
        width: Schema.optionalKey(Schema.Int),
        appearance: Schema.optionalKey(Schema.Literals(["light", "dark"])),
      }),
      Schema.Struct({
        ...WidgetSource.members[1].fields,
        width: Schema.optionalKey(Schema.Int),
        appearance: Schema.optionalKey(Schema.Literals(["light", "dark"])),
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
