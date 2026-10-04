/**
 * The shape of Ruth's tools: descriptions and input/output schemas, without the
 * server-side `execute`. Kept free of server dependencies so clients can derive
 * their message types from it (see `messages.ts`).
 */
import {
  ArtifactId,
  ChunkId,
  ChunkLocation,
  FileAction,
  ItemId,
  PageContext,
} from "@avenire/contracts";
import { tool } from "ai";
import * as Schema from "effect/Schema";

/** An Effect Schema as a Standard Schema with JSON Schema, which the AI SDK accepts. */
export const standardSchema = <S extends Schema.Codec<unknown, unknown>>(schema: S) =>
  Schema.toStandardJSONSchemaV1(Schema.toStandardSchemaV1(schema));

const ChunkResult = Schema.Struct({
  chunkId: ChunkId,
  itemId: ItemId,
  title: Schema.String,
  location: ChunkLocation,
  content: Schema.String,
});

export const searchMaterialsSpec = {
  description: "Search the user's own study material. Always do this before explaining a concept.",
  inputSchema: standardSchema(
    Schema.Struct({ query: Schema.NonEmptyString, limit: Schema.optionalKey(Schema.Int) }),
  ),
  outputSchema: standardSchema(Schema.Array(ChunkResult)),
};

export const readItemSpec = {
  description: "Read consecutive chunks of one item, e.g. to see the context around a search hit.",
  inputSchema: standardSchema(
    Schema.Struct({
      itemId: ItemId,
      fromOrdinal: Schema.optionalKey(Schema.Int),
      count: Schema.optionalKey(Schema.Int),
    }),
  ),
  outputSchema: standardSchema(Schema.Array(ChunkResult)),
};

export const runPythonSpec = {
  description:
    "Run Python once in a fresh sandbox for real computation (brute force, statistics, " +
    "symbolic math, data processing). Matplotlib figures are saved and returned as figures.",
  inputSchema: standardSchema(
    Schema.Struct({
      code: Schema.String,
      packages: Schema.optionalKey(Schema.Array(Schema.String)),
    }),
  ),
  outputSchema: standardSchema(
    Schema.Struct({
      stdout: Schema.String,
      exitCode: Schema.Number,
      figures: Schema.Array(Schema.Struct({ artifactId: ArtifactId, title: Schema.String })),
    }),
  ),
};

export const PageContextResult = Schema.Struct({
  ...PageContext.fields,
  runtime: Schema.Struct({
    version: Schema.String,
    kits: Schema.Array(Schema.String),
    capabilities: Schema.Array(Schema.String),
  }),
  budgets: Schema.Struct({ maxSourceBytes: Schema.Int, frameBudgetMs: Schema.Number }),
  existingVisuals: Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String })),
});
export type PageContextResult = typeof PageContextResult.Type;

export const getPageContextSpec = {
  description:
    "Describe the page an inline visual will render into: surface, platform, width, colour " +
    "scheme, theme tokens, fonts, available runtime kits, budgets and visuals already in this " +
    "thread. Call this before writing an <avenire-chart> or <avenire-sim>.",
  inputSchema: standardSchema(Schema.Struct({ purpose: Schema.optionalKey(Schema.String) })),
  outputSchema: standardSchema(PageContextResult),
};

export const proposeFileActionSpec = {
  description:
    "Change the user's files: move an item to a cluster, rename it, archive it (delete " +
    "archives) or create a note. The user may have to approve it first.",
  inputSchema: standardSchema(Schema.Struct({ action: FileAction })),
  outputSchema: standardSchema(Schema.Struct({ itemId: ItemId, summary: Schema.String })),
};

export const askUserSpec = {
  description:
    "Ask the user a question and wait for the answer, optionally with choices. Use it only " +
    "when you cannot continue without their input.",
  inputSchema: standardSchema(
    Schema.Struct({
      question: Schema.String,
      choices: Schema.optionalKey(Schema.Array(Schema.String)),
      multiSelect: Schema.optionalKey(Schema.Boolean),
      allowCustom: Schema.Boolean,
    }),
  ),
  outputSchema: standardSchema(Schema.Struct({ answers: Schema.Array(Schema.String) })),
};

/** Ruth's toolset as the model and the UI see it; `ask_user` is answered by the client. */
export const ruthToolSpecs = {
  search_materials: tool(searchMaterialsSpec),
  read_item: tool(readItemSpec),
  run_python: tool(runPythonSpec),
  get_page_context: tool(getPageContextSpec),
  propose_file_action: tool(proposeFileActionSpec),
  ask_user: tool(askUserSpec),
};
export type RuthTools = typeof ruthToolSpecs;
