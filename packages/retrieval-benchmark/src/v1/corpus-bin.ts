import {
  defaultCorpusDir,
  fetchCorpus,
  importMit,
  importLocalFixtures,
  readContracts,
  readArtifact,
} from "./corpus.ts";

const args = process.argv.slice(2);
const at = args.indexOf("--corpus-dir");
if (at >= 0 && !args[at + 1]) throw new Error("--corpus-dir requires a path");
const corpusDir = at < 0 ? defaultCorpusDir : (args[at + 1] ?? defaultCorpusDir);
const command = args[0];
if (command === "fetch" || command === "import-mit" || command === "import-local") {
  const results =
    command === "fetch"
      ? await fetchCorpus(corpusDir)
      : command === "import-mit"
        ? await importMit(corpusDir)
        : await importLocalFixtures(corpusDir);
  for (const result of results)
    console.log(`${result.status}\t${result.id}${result.reason ? `\t${result.reason}` : ""}`);
  console.log(
    JSON.stringify(
      Object.fromEntries(
        ["downloaded", "reused", "failed"].map((status) => [
          status,
          results.filter((result) => result.status === status).length,
        ]),
      ),
    ),
  );
} else if (command === "status") {
  const { manifest } = await readContracts();
  for (const artifact of manifest.artifacts) {
    try {
      console.log(
        `${(await readArtifact(corpusDir, artifact)) ? "present" : "missing"}\t${artifact.id}`,
      );
    } catch (cause) {
      console.log(`invalid\t${artifact.id}\t${String(cause)}`);
    }
  }
} else throw new Error("Expected fetch, import-local, import-mit, or status");
