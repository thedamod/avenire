/**
 * Scores save-to suggestions against hand labels: embedding-only vs embedding shortlist + judge.
 * Labels live outside the repo (they name a person's files):
 *   { "email": "...", "labels": [{ "fileId": "...", "expect": "<folderId>" | "none" }] }
 *   pnpm --filter @avenire/web filing:eval -- /path/to/labels.json
 * Read-only; the judge is the chat-title model (GROQ_API_KEY).
 */
import { judgeFiling } from "@avenire/ai/filing-judge";
import { RuthTitleModel, RuthTitleModelLive } from "@avenire/ai/models";
import { FileId, UserId } from "@avenire/contracts";
import { Database, DatabaseLive } from "@avenire/database/client";
import { user } from "@avenire/database/schema";
import { filingContexts } from "@avenire/ingestion/folder";
import { eq } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { readFileSync } from "node:fs";

const path = process.argv.slice(2).find((arg) => arg !== "--");
if (!path) throw new Error("Pass the labels JSON path");
const spec = JSON.parse(readFileSync(path, "utf8")) as {
  email: string;
  labels: Array<{ fileId: string; expect: string }>;
};

const program = Effect.gen(function* () {
  const database = yield* Database;
  const [owner] = yield* database.use((db) =>
    db.select({ id: user.id }).from(user).where(eq(user.email, spec.email)),
  );
  if (!owner) return yield* Effect.die(`No account for ${spec.email}`);
  const { model } = yield* RuthTitleModel;
  if (!model) return yield* Effect.die("GROQ_API_KEY is missing; the judge is disabled");
  const contexts = yield* filingContexts(
    UserId.make(owner.id),
    spec.labels.map((label) => FileId.make(label.fileId)),
  );
  const rows = [];
  let embeddingHits = 0;
  let judgeHits = 0;
  for (const label of spec.labels) {
    const context = contexts.find((row) => row.fileId === label.fileId);
    if (!context) continue;
    const name = (id: string | null | undefined) =>
      id ? (context.candidates.find((row) => row.folderId === id)?.name ?? id) : "none";
    const embedding = context.ranked[0]?.folderId ?? "none";
    // Spaced out so a run stays under the provider's per-minute token limit.
    if (rows.length) yield* Effect.sleep("4 seconds");
    let failure = "";
    const verdict = yield* judgeFiling(model, context).pipe(
      Effect.catchTag("FilingJudgeError", (error) =>
        Effect.sync(() => {
          failure = String((error.cause as Error)?.message ?? error.cause).slice(0, 60);
          return null;
        }),
      ),
    );
    const judged = verdict === null ? "error" : (verdict.folderId ?? "none");
    embeddingHits += Number(embedding === label.expect);
    judgeHits += Number(judged === label.expect);
    rows.push({
      file: context.title.slice(0, 36),
      expect: name(label.expect === "none" ? null : label.expect),
      embedding: `${name(embedding === "none" ? null : embedding)}${embedding === label.expect ? " ✓" : " ✗"}`,
      judge: `${judged === "error" ? "error" : name(judged === "none" ? null : judged)}${judged === label.expect ? " ✓" : " ✗"}`,
      newNotebook: verdict?.newNotebook ?? failure,
    });
  }
  console.table(rows);
  console.log(
    `embedding-only ${embeddingHits}/${rows.length} · shortlist + judge ${judgeHits}/${rows.length}`,
  );
});

await Effect.runPromise(
  program.pipe(Effect.provide(Layer.mergeAll(DatabaseLive, RuthTitleModelLive))),
);
