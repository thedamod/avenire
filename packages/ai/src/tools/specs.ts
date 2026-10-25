/** Client-safe tool contracts shared by chat message typing and the Cloud manifest. */
import {
  ChunkId,
  ChunkLocation,
  FolderId,
  FileSelector,
  GraphFact,
  FileId,
  FileKind,
  FileSource,
  SearchAspect,
  SearchDepth,
  SearchHit,
  Widget,
  WidgetSource,
} from "@avenire/contracts";
import { THEME_TOKEN_NAMES, WIDGET_TOKEN_SHEET } from "@avenire/ui/tokens";
import { tool } from "ai";
import * as Schema from "effect/Schema";

import { standardSchema, standardObjectSchema } from "./schema.ts";

export const FileEntry = Schema.Struct({
  fileId: FileId,
  title: Schema.String,
  kind: FileKind,
  drivePath: Schema.String,
  size: Schema.NullOr(Schema.Number),
  source: FileSource,
  tags: Schema.Array(Schema.String),
  createdAt: Schema.String,
  contentModifiedAt: Schema.NullOr(Schema.String),
});
export type FileEntry = typeof FileEntry.Type;

const ChunkResult = Schema.Struct({
  chunkId: ChunkId,
  fileId: FileId,
  title: Schema.String,
  location: ChunkLocation,
  content: Schema.String,
});
const FileMutationResult = Schema.Struct({ fileId: FileId, summary: Schema.String });
const boundedInt = (max: number) =>
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: max }));

export const searchMaterialsSpec = {
  name: "search_materials",
  description:
    "Search the user's study material before explaining a concept. Use deep depth for comparisons, multi-step, or relationship questions. Defaults to the current chat scope. Set widenScope only when the user explicitly asks to search beyond it. Abstained means the materials do not cover the question; facts are graph relations with chunk citations.",
  inputSchema: standardSchema(
    Schema.Struct({
      query: Schema.NonEmptyString,
      limit: Schema.optionalKey(Schema.Int),
      depth: Schema.optionalKey(SearchDepth),
      widenScope: Schema.optionalKey(Schema.Boolean),
    }),
  ),
  outputSchema: standardSchema(
    Schema.Struct({
      hits: Schema.Array(
        Schema.Struct({
          ...ChunkResult.fields,
          relevance: Schema.NullOr(Schema.Number),
          context: SearchHit.fields.context,
        }),
      ),
      facts: Schema.Array(GraphFact),
      aspects: Schema.Array(SearchAspect),
      abstained: Schema.Boolean,
    }),
  ),
};
export const listFilesSpec = {
  name: "list_files",
  description:
    "List library files and, when no folder is specified, folders. The inbox contains files with no folder membership. Archived files are excluded.",
  inputSchema: standardSchema(
    Schema.Struct({
      folderId: Schema.optionalKey(Schema.Union([FolderId, Schema.Literal("inbox")])),
      kinds: Schema.optionalKey(Schema.Array(FileKind)),
      cursor: Schema.optionalKey(Schema.String),
      limit: Schema.optionalKey(boundedInt(100)),
    }),
  ),
  outputSchema: standardSchema(
    Schema.Struct({
      folders: Schema.Array(
        Schema.Struct({ folderId: FolderId, name: Schema.String, fileCount: Schema.Int }),
      ),
      files: Schema.Array(FileEntry),
      nextCursor: Schema.NullOr(Schema.String),
    }),
  ),
};
export const findFilesSpec = {
  name: "find_files",
  description:
    "Find library files by metadata, activity, explicit ids, and topic. Selector parts combine with AND; each file explains why it matched.",
  inputSchema: standardSchema(
    Schema.Struct({ selector: FileSelector, limit: Schema.optionalKey(boundedInt(200)) }),
  ),
  outputSchema: standardSchema(
    Schema.Struct({
      files: Schema.Array(Schema.Struct({ ...FileEntry.fields, reason: Schema.String })),
      truncated: Schema.Boolean,
    }),
  ),
};
export const readFileSpec = {
  name: "read_file",
  description: "Read consecutive chunks of one file, e.g. to see the context around a search hit.",
  inputSchema: standardSchema(
    Schema.Struct({
      fileId: FileId,
      fromOrdinal: Schema.optionalKey(Schema.Int),
      count: Schema.optionalKey(Schema.Int),
    }),
  ),
  outputSchema: standardSchema(Schema.Array(ChunkResult)),
};
export const writeFileSpec = {
  name: "write_file",
  description:
    "Create a markdown note in the library, optionally in a folder. Requires approval unless Full access is enabled.",
  inputSchema: standardSchema(
    Schema.Struct({
      title: Schema.NonEmptyString,
      content: Schema.String,
      folderId: Schema.optionalKey(FolderId),
    }),
  ),
  outputSchema: standardSchema(FileMutationResult),
};
export const moveFileSpec = {
  name: "move_file",
  description: "Move a file into a folder. Requires approval unless Full access is enabled.",
  inputSchema: standardSchema(Schema.Struct({ fileId: FileId, folderId: FolderId })),
  outputSchema: standardSchema(FileMutationResult),
};
export const renameFileSpec = {
  name: "rename_file",
  description:
    "Rename a file and update its search index. Requires approval unless Full access is enabled.",
  inputSchema: standardSchema(Schema.Struct({ fileId: FileId, title: Schema.NonEmptyString })),
  outputSchema: standardSchema(FileMutationResult),
};
export const archiveFileSpec = {
  name: "archive_file",
  description:
    "Archive a file. Archive is the only delete operation; it is undoable for 30 days. Nothing is permanently deleted by this tool. Requires approval unless Full access is enabled.",
  inputSchema: standardSchema(Schema.Struct({ fileId: FileId })),
  outputSchema: standardSchema(FileMutationResult),
};
export const renderWidgetSpec = {
  name: "render_widget",
  description:
    "Render a standalone, self-contained HTML widget with inline CSS/JS only. Preview first with preview_widget. Small hand-written pages may import bundled /kits/math.js and /kits/iso.js; Node builds can inline the sandbox runtime. No network or other external scripts, fonts, or images: CSP blocks them; data: URIs are allowed. Respond to the container width and provide accessible text alternatives and labels. Pass exactly one of html (at most 512,000 bytes) or path (a built HTML file in the thread sandbox, at most 8 MiB). Shared figure components and examples guide appearance and behaviour; concise browser code and optional Node builds are both valid. Use path for built files and never read finished HTML into context. Explain the visual in chat prose.\n\n" +
    WIDGET_TOKEN_SHEET +
    (() => {
      const missing = THEME_TOKEN_NAMES.filter((name) => !WIDGET_TOKEN_SHEET.includes(name));
      return missing.length === 0 ? "" : `\n- Additional drawing tokens: ${missing.join(", ")}.`;
    })(),
  inputSchema: standardObjectSchema(
    Schema.Union([
      Schema.Struct({
        ...WidgetSource.members[0].fields,
        title: Schema.NonEmptyString.check(Schema.isMaxLength(120)),
      }),
      Schema.Struct({
        ...WidgetSource.members[1].fields,
        title: Schema.NonEmptyString.check(Schema.isMaxLength(120)),
      }),
    ]),
  ),
  outputSchema: standardSchema(Widget),
};
export const RUTH_TOOL_SPECS = {
  search_materials: searchMaterialsSpec,
  list_files: listFilesSpec,
  find_files: findFilesSpec,
  read_file: readFileSpec,
  write_file: writeFileSpec,
  move_file: moveFileSpec,
  rename_file: renameFileSpec,
  archive_file: archiveFileSpec,
  render_widget: renderWidgetSpec,
};
export type RuthToolName = keyof typeof RUTH_TOOL_SPECS;
export interface ToolPolicy {
  readonly agents: ReadonlyArray<"ruth" | "ruth-cloud">;
  readonly approval: "never" | "unless-full-access";
}
export const RUTH_TOOL_POLICY: Record<RuthToolName, ToolPolicy> = {
  search_materials: { agents: ["ruth", "ruth-cloud"], approval: "never" },
  list_files: { agents: ["ruth", "ruth-cloud"], approval: "never" },
  find_files: { agents: ["ruth", "ruth-cloud"], approval: "never" },
  read_file: { agents: ["ruth", "ruth-cloud"], approval: "never" },
  write_file: { agents: ["ruth"], approval: "unless-full-access" },
  move_file: { agents: ["ruth"], approval: "unless-full-access" },
  rename_file: { agents: ["ruth"], approval: "unless-full-access" },
  archive_file: { agents: ["ruth"], approval: "unless-full-access" },
  render_widget: { agents: ["ruth"], approval: "never" },
};
export const ruthKitSpecs = {
  search_materials: tool(searchMaterialsSpec),
  list_files: tool(listFilesSpec),
  find_files: tool(findFilesSpec),
  read_file: tool(readFileSpec),
  write_file: tool(writeFileSpec),
  move_file: tool(moveFileSpec),
  rename_file: tool(renameFileSpec),
  archive_file: tool(archiveFileSpec),
  render_widget: tool(renderWidgetSpec),
};

export * from "./sandbox-specs.ts";

export * from "./cloud-specs.ts";
