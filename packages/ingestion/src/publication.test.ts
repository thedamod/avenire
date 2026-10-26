import { FileId, IngestionJobId, StorageKey, UserId } from "@avenire/contracts";
import { Database, DatabaseError } from "@avenire/database/client";
import * as schema from "@avenire/database/schema";
import { expect, it } from "@effect/vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import { randomBytes } from "node:crypto";

import { type IngestionClaim } from "./claim.ts";
import { Embedder } from "./embed.ts";
import { GraphError } from "./graph/extract.ts";
import { GraphIndexer } from "./graph/indexer.ts";
import { FileIndexer, FileIndexerLive, type IndexInput } from "./indexer.ts";
import { claimJobs, enqueueIngestionTx, recordIngestionFailureTx } from "./worker.ts";

const userId = UserId.make("owner");
const fileId = FileId.make("file");
const claim: IngestionClaim = {
  id: IngestionJobId.make("job"),
  userId,
  fileId,
  generation: 1,
  claimToken: "first",
};
const source = {
  title: "Geometry",
  storageKey: "source",
  sourceUrl: null,
  updatedAt: new Date("2026-10-17T00:00:00Z"),
  documentKey: null,
};
const input: IndexInput = {
  userId,
  fileId,
  title: source.title,
  source,
  claim,
  access: "paywalled",
  sections: [{ text: "The angles of a triangle", location: {} }],
  document: {
    key: StorageKey.make("document"),
    contentHash: "hash",
    extractorVersion: 1,
    contentChanged: false,
  },
};
type Query = { sql: string; params: unknown[] };

/** Production SQL and service boundary with controlled commit/rollback; no PostgreSQL claim. */
const fixture = () => {
  const queries: Query[] = [];
  const committed: Query[] = [];
  const texts: string[] = [];
  let token = claim.claimToken;
  let generation = claim.generation;
  let title = source.title;
  let updatedAt = source.updatedAt.toISOString();
  let documentKey: string | null = null;
  let purging = false;
  let inTransaction = false;
  let graphFails = false;
  let prepareFails = false;
  let beforePublication = () => {};
  const clientFor = (pending?: Query[]): unknown => ({
    options: { parsers: {}, serializers: {} },
    unsafe: (sql: string, params: unknown[]) => {
      const query = { sql, params };
      queries.push(query);
      const execute = async () => {
        if (/^(insert|update|delete)/u.test(sql)) (pending ?? committed).push(query);
        if (sql.startsWith('select "title", "storage_key", "source_url"'))
          return purging
            ? []
            : [[title, source.storageKey, source.sourceUrl, updatedAt, documentKey]];
        if (sql.startsWith('select "id" from "ingestion_job"'))
          return token === claim.claimToken && generation === claim.generation ? [[claim.id]] : [];
        if (sql.startsWith('select "id" from "user"')) return [[userId]];
        if (sql.startsWith('select "id" from "file"')) return [[fileId]];
        if (sql.startsWith("select avg(")) return [[null]];
        return [];
      };
      const result = execute();
      return Object.assign(result, { values: () => result });
    },
    begin: async <A>(callback: (client: unknown) => Promise<A>) => {
      const pending: Query[] = [];
      inTransaction = true;
      try {
        const result = await callback(clientFor(pending));
        committed.push(...pending);
        return result;
      } finally {
        inTransaction = false;
      }
    },
  });
  const db = drizzle({ client: clientFor() as never, schema });
  const database = Database.of({
    db,
    use: (fn) =>
      Effect.tryPromise({ try: () => fn(db), catch: (cause) => new DatabaseError({ cause }) }),
    useTransaction: (fn) =>
      Effect.tryPromise({
        try: () => db.transaction(fn),
        catch: (cause) => new DatabaseError({ cause }),
      }),
  });
  const crypto = Crypto.make({
    randomBytes: (size) => new Uint8Array(randomBytes(size)),
    digest: () => Effect.die("unused"),
  });
  const embedder = Embedder.of({
    model: "model",
    embedQueries: () => Effect.succeed([]),
    embedDocuments: (values) =>
      Effect.sync(() => {
        expect(inTransaction).toBe(false);
        texts.push(...values);
        return values.map(() => [1, 0]);
      }),
  });
  const graph = GraphIndexer.of({
    indexChunks: () => Effect.die("unused"),
    prepareChunks: () =>
      Effect.gen(function* () {
        expect(inTransaction).toBe(false);
        beforePublication();
        if (prepareFails)
          return yield* new GraphError({ operation: "extract", cause: "provider failed" });
        return {
          stats: { entities: 0, relations: 0 },
          publish: async () => {
            expect(inTransaction).toBe(true);
            if (graphFails) throw new Error("graph publication failed");
          },
        };
      }),
  });
  return {
    queries,
    committed,
    texts,
    db,
    supersede: () => {
      generation += 2;
    },
    reclaim: () => {
      token = "second";
    },
    rename: () => {
      title = "Renamed";
    },
    edit: () => {
      updatedAt = "2026-10-17T00:01:00Z";
    },
    replaceDocument: () => {
      documentKey = "other-document";
    },
    purge: () => {
      purging = true;
    },
    failGraph: () => {
      graphFails = true;
    },
    failPreparation: () => {
      prepareFails = true;
    },
    beforePublication: (callback: () => void) => {
      beforePublication = callback;
    },
    run: (value = input) =>
      Effect.gen(function* () {
        const indexer = yield* FileIndexer;
        return yield* indexer.index(value);
      }).pipe(
        Effect.provide(FileIndexerLive),
        Effect.provideService(Database, database),
        Effect.provideService(Embedder, embedder),
        Effect.provideService(GraphIndexer, graph),
        Effect.provideService(Crypto.Crypto, crypto),
      ),
  };
};

it.effect.each(["supersede", "reclaim", "rename", "edit", "replaceDocument", "purge"] as const)(
  "rejects %s between provider preparation and publication",
  (reason) =>
    Effect.gen(function* () {
      const state = fixture();
      state.beforePublication(state[reason]);
      expect((yield* Effect.exit(state.run()))._tag).toBe("Failure");
      expect(
        state.committed.filter((query) => !query.sql.startsWith('insert into "embedding_cache"')),
      ).toEqual([]);
      const fence = state.queries.find(
        (query) => query.sql.includes('from "file"') && query.sql.includes('"purge_started_at"'),
      )!;
      expect(fence.sql).toContain("for update");
      if (reason === "reclaim" || reason === "supersede") {
        const job = state.queries.find((query) => query.sql.includes('from "ingestion_job"'))!;
        expect(job.sql).toContain('"claim_token" =');
        expect(job.sql).toContain('"generation" =');
        expect(job.sql).toContain('"locked_until" > now()');
        expect(job.params).toContain("first");
      }
    }),
);

it.effect.each(["failGraph", "failPreparation"] as const)(
  "keeps the old corpus on %s and can retry",
  (failure) =>
    Effect.gen(function* () {
      const state = fixture();
      state[failure]();
      expect((yield* Effect.exit(state.run()))._tag).toBe("Failure");
      expect(state.committed.filter((query) => !query.sql.includes('"embedding_cache"'))).toEqual(
        [],
      );
      const retry = fixture();
      yield* retry.run();
      expect(retry.committed.some((query) => query.sql.startsWith('insert into "chunk"'))).toBe(
        true,
      );
      expect(retry.committed.some((query) => query.sql.startsWith('update "user"'))).toBe(true);
      const completion = retry.committed.find((query) =>
        query.sql.startsWith('update "ingestion_job"'),
      )!;
      expect(completion.params).toContain("indexed");
      expect(completion.sql).toContain('"claim_token" =');
      expect(retry.texts[0]).toContain("Geometry");
      const chunkWrite = retry.committed.find((query) =>
        query.sql.startsWith('insert into "chunk"'),
      )!;
      expect(chunkWrite.sql).toContain("setweight(to_tsvector('english'");
      expect(chunkWrite.params).toContain("Geometry");
      expect(retry.committed.some((query) => query.sql.includes('"file_event"'))).toBe(false);
    }),
);

it("builds skip-locked reclaim and preserves an active lease across repeated enqueue", async () => {
  const state = fixture();
  const query = claimJobs(state.db, 2, "fresh-token").toSQL();
  expect(query.sql).toContain("for update skip locked");
  expect(query.sql).toContain('"locked_until" < now()');
  expect(query.params).toContain("fresh-token");
  await state.db.transaction(async (tx) => {
    await enqueueIngestionTx(tx, userId, fileId, claim.id);
    await enqueueIngestionTx(tx, userId, fileId, claim.id);
  });
  const enqueue = state.committed.filter((query) =>
    query.sql.startsWith('insert into "ingestion_job"'),
  );
  expect(enqueue).toHaveLength(2);
  for (const row of enqueue) {
    expect(row.sql).toContain('"ingestion_job"."claim_token" IS NOT NULL');
    expect(row.sql).toContain('"ingestion_job"."locked_until" > now()');
    expect(row.sql).toContain('"ingestion_job"."generation" + 1');
  }
});

it.effect("publishes partial searchable content and its retry backoff atomically", () =>
  Effect.gen(function* () {
    const state = fixture();
    yield* state.run({ ...input, retryAfterMinutes: 4 });
    expect(state.committed.some((query) => query.sql.startsWith('insert into "chunk"'))).toBe(true);
    const completion = state.committed.find((query) =>
      query.sql.startsWith('update "ingestion_job"'),
    )!;
    expect(completion.params).toContain("indexed");
    expect(completion.params).toContain(4);
    expect(completion.params).toContain("Partial extraction; retry scheduled.");
    expect(completion.sql).toContain("interval '1 minute'");
    expect(completion.sql).toContain('"claim_token" =');
  }),
);

it.effect("access writes publish with success or partial content only after the claim fence", () =>
  Effect.gen(function* () {
    const state = fixture();
    yield* state.run({ ...input, retryAfterMinutes: 4 });
    const access = state.committed.find(
      (query) => query.sql.startsWith('update "file"') && query.sql.includes('"access"'),
    )!;
    expect(access.params).toContain("paywalled");
    const stale = fixture();
    stale.supersede();
    expect((yield* stale.run().pipe(Effect.result))._tag).toBe("Failure");
    expect(stale.committed.some((query) => query.sql.includes('"access"'))).toBe(false);
  }),
);
it.effect(
  "worker failure access writes refuse stale generations and require a live publication lease",
  () =>
    Effect.gen(function* () {
      const stale = fixture();
      stale.supersede();
      yield* Effect.promise(() =>
        stale.db.transaction((tx) =>
          recordIngestionFailureTx(
            tx,
            { ...claim, attempts: 1 },
            "Login required",
            undefined,
            "login-required",
          ),
        ),
      );
      expect(stale.committed).toEqual([]);
      const live = fixture();
      yield* Effect.promise(() =>
        live.db.transaction((tx) =>
          recordIngestionFailureTx(
            tx,
            { ...claim, attempts: 1 },
            "Login required",
            undefined,
            "login-required",
          ),
        ),
      );
      expect(
        live.committed.find((query) => query.sql.startsWith('update "file"'))?.params,
      ).toContain("login-required");
      const fence = live.queries.find((query) => query.sql.includes('from "ingestion_job"'))!;
      expect(fence.sql).toContain('"locked_until" > now()');
      expect(fence.sql).toContain('"generation" =');
      expect(
        live.queries
          .filter((query) => query.sql.startsWith("select"))
          .map((query) => query.sql)
          .join(" "),
      ).toMatch(/from "user".*from "file".*from "ingestion_job"/);
    }),
);
