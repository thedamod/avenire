/** Cloud schemas can be imported by clients without pulling in Daytona, storage or the database. */
import {
  FileSelector,
  HydrationResult,
  FileId,
  PendingApprovalId,
  AssetId,
} from "@avenire/contracts";
import { tool } from "ai";
import * as Schema from "effect/Schema";
import { standardSchema } from "./schema.ts";

export const hydrateFilesSpec = {
  name: "hydrate_files",
  description:
    "Copy library files into /home/daytona/.avenire/<stable-user-slug>/<folder>/<file>. Inputs are read-only; work on workspace copies. Selector parts combine with AND: time selects activity, topic selects relevance, filters select metadata, and explicit selects ids. Today means today in the run's time zone. Unchanged files are skipped; count and byte caps apply. Call again whenever more material is needed.",
  inputSchema: standardSchema(
    Schema.Struct({
      selector: FileSelector,
      maxFiles: Schema.optionalKey(
        Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 200 })),
      ),
      maxBytes: Schema.optionalKey(
        Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1024 ** 3 })),
      ),
    }),
  ),
  outputSchema: standardSchema(HydrationResult),
};
export const publishOutputSpec = {
  name: "publish_output",
  description:
    "Publish a workspace file up to 100 MB as a new library file in this run's folder. With replaces, propose a sync of a hydrated file for morning review; the original is only updated after the user accepts. Paths must stay inside the workspace and outside .avenire.",
  inputSchema: standardSchema(
    Schema.Struct({
      sandboxPath: Schema.NonEmptyString,
      title: Schema.optionalKey(Schema.String),
      replaces: Schema.optionalKey(FileId),
    }),
  ),
  outputSchema: standardSchema(
    Schema.Union([
      Schema.Struct({ kind: Schema.Literal("file"), fileId: FileId, drivePath: Schema.String }),
      Schema.Struct({
        kind: Schema.Literal("sync"),
        approvalId: PendingApprovalId,
        conflict: Schema.NullOr(Schema.String),
      }),
    ]),
  ),
};
export const publishReportSpec = {
  name: "publish_report",
  description:
    "Save this run's markdown report and publish up to twenty workspace outputs as permanent private assets.",
  inputSchema: standardSchema(
    Schema.Struct({
      status: Schema.optionalKey(Schema.Literals(["succeeded", "failed"])),
      markdown: Schema.String.check(Schema.isMaxLength(100_000)),
      assets: Schema.optionalKey(Schema.Array(Schema.String).check(Schema.isMaxLength(20))),
    }),
  ),
  outputSchema: standardSchema(
    Schema.Struct({
      published: Schema.Array(
        Schema.Struct({ sandboxPath: Schema.String, assetId: AssetId, url: Schema.String }),
      ),
    }),
  ),
};
export const CLOUD_TOOL_SPECS = {
  hydrate_files: hydrateFilesSpec,
  publish_output: publishOutputSpec,
  publish_report: publishReportSpec,
};
export const CLOUD_TOOL_POLICY = {
  hydrate_files: { agents: ["ruth-cloud"], approval: "never" },
  publish_output: { agents: ["ruth-cloud"], approval: "never" },
  publish_report: { agents: ["ruth-cloud"], approval: "never" },
} as const;
export const ruthCloudSpecs = {
  hydrate_files: tool(hydrateFilesSpec),
  publish_output: tool(publishOutputSpec),
  publish_report: tool(publishReportSpec),
};
