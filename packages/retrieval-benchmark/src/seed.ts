import { ItemId, UserId } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { item, user } from "@avenire/database/schema";
import { Embedder } from "@avenire/ingestion/embed";
import { ItemIndexer } from "@avenire/ingestion/indexer";
import { eq, sql } from "drizzle-orm";
import * as Effect from "effect/Effect";

import { documents } from "./dataset/index.ts";

export const BENCH_USER_ID = UserId.make("bench-user");

/** Replaces the benchmark user's corpus using the same indexer as ingestion. */
/** Inserts one dataset document as a note and indexes it like ingestion would. */
const seedDocument = Effect.fn("RetrievalBenchmark.seedDocument")(function* (
  document: (typeof documents)[number],
) {
  const database = yield* Database;
  const indexer = yield* ItemIndexer;
  const itemId = ItemId.make(document.id);
  yield* database.use((db) =>
    db.insert(item).values({
      id: itemId,
      userId: BENCH_USER_ID,
      kind: "note",
      title: document.title,
      placement: "filed",
      mimeType: "text/plain",
      dedupeKey: `retrieval-benchmark:${document.id}`,
    }),
  );
  return yield* indexer.index({
    userId: BENCH_USER_ID,
    itemId,
    title: document.title,
    transcript: false,
    sections: document.sections.map(({ text, heading }) => ({ text, location: { heading } })),
  });
});

/** Replaces the benchmark user's corpus, indexed through the same indexer as ingestion. */
export const seedCorpus = Effect.gen(function* () {
  const database = yield* Database;
  const embedder = yield* Embedder;
  const now = sql`now()`;
  yield* database.use((db) =>
    db
      .insert(user)
      .values({
        id: BENCH_USER_ID,
        name: "Retrieval benchmark",
        email: "bench-user@avenire.invalid",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: user.id,
        set: { name: "Retrieval benchmark", updatedAt: now },
      }),
  );
  yield* database.use((db) => db.delete(item).where(eq(item.userId, BENCH_USER_ID)));
  const stats = yield* Effect.forEach(documents, seedDocument);
  return {
    documents: documents.length,
    chunks: stats.reduce((sum, row) => sum + row.chunks, 0),
    model: embedder.model,
  };
}).pipe(Effect.withSpan("RetrievalBenchmark.seed"));
