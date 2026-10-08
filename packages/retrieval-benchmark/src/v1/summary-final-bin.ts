import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as Schema from "effect/Schema";

import { defaultCorpusDir } from "./corpus.ts";
import { RunFile } from "./run-file.ts";
import { summarizeFinal } from "./summary-final.ts";

const [standardPath, deepPath, extra] = process.argv.slice(2);
if (standardPath === undefined || deepPath === undefined || extra !== undefined) {
  throw new Error("Usage: pnpm bench:summary <standard-run.json> <deep-run.json>");
}
const readRun = async (path: string) =>
  Schema.decodeUnknownSync(RunFile)(JSON.parse(await readFile(resolve(path), "utf8")));
const [standard, deep] = await Promise.all([readRun(standardPath), readRun(deepPath)]);
const summary = summarizeFinal(standard, deep);
const output = resolve(defaultCorpusDir, "runs", "summary-final.json");
await mkdir(resolve(defaultCorpusDir, "runs"), { recursive: true });
await writeFile(output, `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`${output}\n`);
