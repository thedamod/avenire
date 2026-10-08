import { readFile, writeFile } from "node:fs/promises";
import { parse, resolve } from "node:path";
import * as Schema from "effect/Schema";

import { calibrate } from "./calibrate.ts";
import { dataRoot, readContracts } from "./corpus.ts";
import { Dataset } from "./domain.ts";
import { RunFile } from "./run-file.ts";
import { rescoreRun } from "./rescore.ts";

const paths = process.argv.slice(2);
if (paths.length === 0) throw new Error("Usage: pnpm bench:calibrate <run.json...>");

const runs = await Promise.all(
  paths.map(async (path) =>
    Schema.decodeUnknownSync(RunFile)(JSON.parse(await readFile(resolve(path), "utf8"))),
  ),
);
if (runs.some((run) => run.config.minRelevance !== 0)) {
  throw new Error("Calibration run files must have RETRIEVAL_MIN_RELEVANCE=0");
}
const results = runs.flatMap((run) => run.results);
const ids = results.map((result) => result.id);
if (new Set(ids).size !== ids.length) {
  throw new Error("Query IDs appear in more than one run");
}
const { dataset: v1 } = await readContracts();
const extension = Schema.decodeUnknownSync(Dataset)(
  JSON.parse(await readFile(resolve(dataRoot, "../v2/extension.json"), "utf8")),
);
const present = new Set(
  results.filter((result) => result.split === "development").map((result) => result.id),
);
const missing = [...v1.queries, ...extension.queries]
  .filter((query) => query.split === "development" && !present.has(query.id))
  .map((query) => query.id);
if (missing.length > 0) {
  throw new Error(
    `Calibration is missing ${missing.length} pinned development queries: ${missing.join(", ")}`,
  );
}
const fitted = calibrate(results);
const pct = (value: number) => `${(value * 100).toFixed(1)}%`.padStart(6);
const threshold = (value: number) => value.toPrecision(17);

process.stdout.write(
  `Development: ${fitted.answerableCount} answerable, ${fitted.unanswerableCount} unanswerable; ${fitted.excludedFailures} failed queries excluded\n` +
    "threshold             abstain TP  false abstain  false rate  precision  recall     F1   eligible\n" +
    fitted.rows
      .map(
        (row) =>
          `${threshold(row.threshold).padEnd(22)} ${String(row.trueAbstentions).padStart(4)} ${String(row.falseAbstentions).padStart(14)} ${pct(row.falseAbstentionRate).padStart(11)} ${pct(row.precision).padStart(10)} ${pct(row.recall).padStart(7)} ${pct(row.f1).padStart(7)}   ${row.eligible ? "yes" : "no"}`,
      )
      .join("\n") +
    `\nChosen RETRIEVAL_MIN_RELEVANCE=${threshold(fitted.chosen.threshold)}\n`,
);

const outputs = await Promise.all(
  paths.map(async (path, index) => {
    const source = resolve(path);
    const name = parse(source);
    const output = resolve(name.dir, `${name.name}-calibrated.json`);
    const run = runs[index];
    if (run === undefined) throw new Error(`Missing decoded run for ${source}`);
    await writeFile(
      output,
      `${JSON.stringify(rescoreRun(run, fitted.chosen.threshold), null, 2)}\n`,
    );
    return output;
  }),
);
for (const output of outputs) {
  process.stdout.write(`Re-scored result: ${output}\n`);
}
