/**
 * Ruth Cloud's tools, bound to one recording desktop box. The run's material is
 * in MATERIALS_DIR and every artifact goes to OUT_DIR; writes anywhere else are
 * rejected, so a run can never edit or delete existing material.
 */
import { resolve, sep } from "node:path";

import { type DesktopBox, WORKSPACE_DIR } from "@avenire/cloud/desktop-box";
import { tool } from "ai";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { loadSkillTool } from "./skills.ts";
import { standardSchema } from "./schema.ts";

/** Where the run's source material is written, one markdown file per item. */
export const MATERIALS_DIR = `${WORKSPACE_DIR}/materials`;
/** Where Ruth Cloud writes the artifacts it was asked for. */
export const OUT_DIR = `${WORKSPACE_DIR}/out`;

const SHELL_TIMEOUT_SECONDS = 300;
/** Tool output handed back to the model is capped so one command can't flood the context. */
const MAX_TOOL_OUTPUT_CHARS = 8_000;

/** A tool failure as the model sees it. */
class RuthCloudToolError extends Schema.TaggedError<RuthCloudToolError>()("RuthCloudToolError", {
  message: Schema.String,
}) {}

const textBytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const decodeText = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
const truncate = (value: string): string => value.slice(0, MAX_TOOL_OUTPUT_CHARS);

export const isWithin = (root: string, target: string): boolean =>
  resolve(target).startsWith(`${resolve(root)}${sep}`);

/** Runs a box operation for a tool; its failure message goes back to the model. */
const runBoxTool = <A>(
  program: Effect.Effect<A, { readonly message: string }>,
  abortSignal: AbortSignal | undefined,
): Promise<A> =>
  Effect.runPromise(
    program.pipe(Effect.mapError((error) => new RuthCloudToolError({ message: error.message }))),
    { signal: abortSignal },
  );

/** The run's tools: study skills, a shell, and file access confined as above. */
export const createRuthCloudTools = (box: DesktopBox) => ({
  load_skill: loadSkillTool(),
  shell: tool({
    description: "Run a shell command in the sandbox workspace.",
    inputSchema: standardSchema(Schema.Struct({ command: Schema.String })),
    execute: ({ command }, { abortSignal }) =>
      runBoxTool(
        box
          .shell(command, { cwd: WORKSPACE_DIR, timeoutSeconds: SHELL_TIMEOUT_SECONDS })
          .pipe(Effect.map(({ exitCode, stdout }) => ({ exitCode, output: truncate(stdout) }))),
        abortSignal,
      ),
  }),
  write_file: tool({
    description: `Write a new file under ${OUT_DIR}. Paths outside that directory are rejected.`,
    inputSchema: standardSchema(Schema.Struct({ path: Schema.String, content: Schema.String })),
    execute: ({ path, content }, { abortSignal }) =>
      runBoxTool(
        isWithin(OUT_DIR, path)
          ? box.writeFile(path, textBytes(content)).pipe(Effect.as({ ok: true }))
          : Effect.fail({ message: `write_file path must be inside ${OUT_DIR}` }),
        abortSignal,
      ),
  }),
  read_file: tool({
    description: `Read a file under ${WORKSPACE_DIR}. Paths outside that directory are rejected.`,
    inputSchema: standardSchema(Schema.Struct({ path: Schema.String })),
    execute: ({ path }, { abortSignal }) =>
      runBoxTool(
        isWithin(WORKSPACE_DIR, path)
          ? box
              .readFile(path)
              .pipe(Effect.map((bytes) => ({ content: truncate(decodeText(bytes)) })))
          : Effect.fail({ message: `read_file path must be inside ${WORKSPACE_DIR}` }),
        abortSignal,
      ),
  }),
  finish: tool({
    description: "Finish the run after all requested artifacts are complete.",
    inputSchema: standardSchema(Schema.Struct({ summary: Schema.String })),
    execute: () => ({ ok: true }),
  }),
});
