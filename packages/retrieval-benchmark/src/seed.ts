import { ChunkId, ItemId, UserId } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { chunk, item, user } from "@avenire/database/schema";
import { chunkSections } from "@avenire/ingestion/chunk";
import { Embedder } from "@avenire/ingestion/embed";
import { eq, sql } from "drizzle-orm";
import * as Effect from "effect/Effect";

import { documents } from "./dataset/index.ts";

export const BENCH_USER_ID = UserId.make("bench-user");

/** Replaces the benchmark user's library with the dataset, chunked and embedded. */
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

  const staged = documents.flatMap((document) => {
    const chunks = chunkSections(
      document.sections.map((section) => ({
        text: section.text,
        location: { heading: section.heading },
      })),
    );
    return chunks.map((value) => ({ document, value }));
  });
  const vectors = yield* embedder.embedMany(staged.map(({ value }) => value.content));

  yield* database.useTransaction(async (tx) => {
    await tx.insert(item).values(
      documents.map((document) => ({
        id: ItemId.make(document.id),
        userId: BENCH_USER_ID,
        kind: "note" as const,
        title: document.title,
        placement: "filed" as const,
        sourceUrl: null,
        storageKey: null,
        mimeType: "text/plain",
        sizeBytes: null,
        captureId: null,
        dedupeKey: `retrieval-benchmark:${document.id}`,
        mediaPositionSec: null,
        contentHash: null,
        createdAt: now,
        updatedAt: now,
      })),
    );
    await tx.insert(chunk).values(
      staged.map(({ document, value }, index) => ({
        id: ChunkId.make(`bench-${document.id}-${value.ordinal}`),
        userId: BENCH_USER_ID,
        itemId: ItemId.make(document.id),
        ordinal: value.ordinal,
        kind: value.kind,
        content: value.content,
        location: value.location,
        tokenCount: value.tokenCount,
        embedding: [...(vectors[index] ?? [])],
        embeddingModel: embedder.model,
      })),
    );
  });
  return { documents: documents.length, chunks: staged.length, model: embedder.model };
}).pipe(Effect.withSpan("RetrievalBenchmark.seed"));
