/**
 * Seeds the demo user's library with a few retrieval-benchmark files (uploaded through the
 * configured Storage driver), in folders, with an "uploaded" event each. Idempotent per file.
 *   pnpm --filter @avenire/web seed:demo
 */
import { FileId, FolderId, type FileKind, UserId } from "@avenire/contracts";
import { Database, DatabaseLive } from "@avenire/database/client";
import { file, fileFolder, folder, user } from "@avenire/database/schema";
import { recordFileEvent } from "@avenire/ingestion/events";
import { newId } from "@avenire/shared/id";
import { fileSourceKey, newKeyVersion } from "@avenire/storage/keys";
import { Storage, StorageLive } from "@avenire/storage/storage";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const DEMO_USER = UserId.make("demo-ruth-user");
const CORPUS = new URL("../../../packages/retrieval-benchmark/data/v1/.cache/", import.meta.url);
const SEED: ReadonlyArray<{
  path: string;
  folder: string;
  kind: FileKind;
  mime: string;
  title?: string;
}> = [
  { path: "controlled/thermodynamics.md", folder: "Physics", kind: "note", mime: "text/markdown" },
  { path: "controlled/bayesian-inference.md", folder: "Statistics", kind: "note", mime: "text/markdown" },
  { path: "controlled/graph-algorithms.md", folder: "Computer science", kind: "note", mime: "text/markdown" },
  { path: "controlled/cell-biology.md", folder: "Biology", kind: "note", mime: "text/markdown" },
  { path: "controlled/climate-proxies.md", folder: "Earth science", kind: "note", mime: "text/markdown" },
  { path: "controlled/historical-sources.md", folder: "Earth science", kind: "note", mime: "text/markdown" },
  {
    path: "generated/retrieval-evaluation-lecture.pptx",
    folder: "Computer science",
    kind: "document",
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
  {
    path: "generated/allocation-memo.docx",
    folder: "Statistics",
    kind: "document",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  {
    path: "generated/experiment-results.xlsx",
    folder: "Statistics",
    kind: "document",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  {
    path: ".cache/arxiv/2607-19333v1.pdf",
    folder: "Computer science",
    kind: "pdf",
    mime: "application/pdf",
    title: "arXiv 2607.19333",
  },
];

const program = Effect.gen(function* () {
  const database = yield* Database;
  const storage = yield* Storage;
  const now = new Date();
  yield* database.use((db) =>
    db
      .insert(user)
      .values({
        id: DEMO_USER,
        name: "Demo Student",
        email: "demo-ruth@avenire.local",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing(),
  );
  const folders = new Map<string, FolderId>();
  for (const name of new Set(SEED.map((entry) => entry.folder))) {
    const existing = yield* database.use((db) =>
      db.query.folder.findFirst({
        where: (f, { and, eq }) => and(eq(f.userId, DEMO_USER), eq(f.name, name)),
      }),
    );
    const id = existing ? FolderId.make(existing.id) : yield* newId(FolderId);
    if (!existing) yield* database.use((db) => db.insert(folder).values({ id, userId: DEMO_USER, name }));
    folders.set(name, id);
  }
  const report: string[] = [];
  for (const entry of SEED) {
    const dedupeKey = `seed:${entry.path}`;
    const existing = yield* database.use((db) =>
      db.query.file.findFirst({
        where: (f, { and, eq }) => and(eq(f.userId, DEMO_USER), eq(f.dedupeKey, dedupeKey)),
      }),
    );
    if (existing) {
      report.push(`kept   ${entry.path} (${existing.id})`);
      continue;
    }
    const bytes = new Uint8Array(yield* Effect.promise(() => readFile(new URL(entry.path, CORPUS))));
    const name = basename(entry.path);
    const fileId = yield* newId(FileId);
    const key = fileSourceKey(DEMO_USER, fileId, name, yield* newKeyVersion);
    yield* storage.put(key, bytes, { contentType: entry.mime });
    yield* database.use((db) =>
      db.transaction(async (tx) => {
        await tx.insert(file).values({
          id: fileId,
          userId: DEMO_USER,
          kind: entry.kind,
          title: entry.title ?? name,
          placement: "filed",
          source: "upload",
          storageKey: key,
          mimeType: entry.mime,
          sizeBytes: bytes.byteLength,
          contentHash: createHash("sha256").update(bytes).digest("hex"),
          dedupeKey,
          contentModifiedAt: now,
        });
        await tx
          .insert(fileFolder)
          .values({ fileId, folderId: folders.get(entry.folder)!, userId: DEMO_USER });
      }),
    );
    yield* recordFileEvent(DEMO_USER, fileId, "uploaded");
    report.push(`seeded ${entry.path} -> ${entry.folder} (${fileId}, ${bytes.byteLength} B)`);
  }
  return report;
});

const report = await Effect.runPromise(
  program.pipe(
    Effect.provide(
      Layer.mergeAll(DatabaseLive, StorageLive).pipe(Layer.provideMerge(NodeServices.layer)),
    ),
  ),
);
process.stdout.write(`${report.join("\n")}\n`);
