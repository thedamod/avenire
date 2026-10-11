/**
 * The shape of Ruth's tools: descriptions and input/output schemas, without the
 * server-side `execute` (see `ruth.ts`, `skills.ts`). Kept free of server
 * dependencies so clients can derive their message types from it.
 */
import { PageContext } from "@avenire/contracts";
import { ruthKitSpecs, ruthSandboxSpecs } from "./specs.ts";
import { tool } from "ai";
import * as Schema from "effect/Schema";

import { AVAILABLE_SKILLS } from "../skills/index.ts";
import { standardSchema } from "./schema.ts";

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
    "thread. Call this before render_widget.",
  inputSchema: standardSchema(Schema.Struct({ purpose: Schema.optionalKey(Schema.String) })),
  outputSchema: standardSchema(PageContextResult),
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

export const loadSkillSpec = {
  description:
    "Load skill instructions into context before acting. Ask only for the skills the task " +
    "needs; the system prompt lists them.",
  inputSchema: standardSchema(
    Schema.Struct({ skills: Schema.NonEmptyArray(Schema.Literals(AVAILABLE_SKILLS)) }),
  ),
  outputSchema: standardSchema(
    Schema.Struct({ skills: Schema.Array(Schema.String), content: Schema.String }),
  ),
};

/** Ruth's toolset as the model and the UI see it; `ask_user` is answered by the client. */
export const ruthToolSpecs = {
  ...ruthKitSpecs,
  ...ruthSandboxSpecs,
  load_skill: tool(loadSkillSpec),
  get_page_context: tool(getPageContextSpec),
  ask_user: tool(askUserSpec),
};
export type RuthTools = typeof ruthToolSpecs;
