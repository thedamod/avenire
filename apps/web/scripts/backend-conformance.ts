/** Real PostgreSQL checks; run only against an explicitly named disposable local test database. */
import { strict as assert } from "node:assert";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { AssetStore } from "@avenire/ai/outputs/assets";
import { CloudTasks, CloudTasksLive } from "@avenire/ai/scheduler";
import { CloudTaskId, FileId, FolderId, IngestionJobId, UserId } from "@avenire/contracts";
import { Database, DatabaseError, makeDatabase } from "@avenire/database/client";
import { advanceCorpusRevision, lockCorpus } from "@avenire/database/corpus";
import {
  chunk,
  cloudRun,
  cloudTask,
  file,
  folder,
  ingestionJob,
  pendingApproval,
  searchCache,
  transcriptCache,
  user,
} from "@avenire/database/schema";
import { EmbedderTest } from "@avenire/ingestion/embed";
import { setFileFoldersTx } from "@avenire/ingestion/folder";
import { SemanticCache, SemanticCacheLive } from "@avenire/ingestion/retrieval/cache";
import { claimJobs, enqueueIngestionTx } from "@avenire/ingestion/worker";
import { newId } from "@avenire/shared/id";
import { claimPurgeStatement, restoreStatement } from "@avenire/storage/archive";
import { and, eq, sql } from "drizzle-orm";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { ownsPublication } from "../../../packages/ingestion/src/claim.ts";

class ConformanceError extends Schema.TaggedError<ConformanceError>()("BackendConformanceError", {
  check: Schema.String,
  cause: Schema.Defect(),
}) {}

const main = Effect.scoped(
  Effect.gen(function* () {
    const url = yield* Config.String("AVENIRE_TEST_DATABASE_URL");
    const target = new URL(url);
    if (
      !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
      !target.pathname.endsWith("_test")
    ) {
      return yield* new ConformanceError({
        check: "disposable database guard",
        cause: "Use a local database whose name ends in _test.",
      });
    }
    const connection = yield* Effect.acquireRelease(
      Effect.sync(() => makeDatabase(url)),
      ({ sql: client }) => Effect.promise(() => client.end({ timeout: 5 })),
    );
    const db = connection.db;
    const use = <A>(check: string, fn: () => Promise<A>) =>
      Effect.tryPromise({
        try: fn,
        catch: (cause) => new ConformanceError({ check, cause }),
      });
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
    const owner = yield* newId(UserId);
    const other = yield* newId(UserId);
    const first = yield* newId(FileId);
    const second = yield* newId(FileId);
    const otherFile = yield* newId(FileId);
    const destination = yield* newId(FolderId);
    const jobId = yield* newId(IngestionJobId);
    const taskId = yield* newId(CloudTaskId);
    const vector = (index: number) => Array.from({ length: 1536 }, (_, i) => (i === index ? 1 : 0));
    const checks: string[] = [];
    const verified = (name: string) =>
      Effect.logInfo("Backend conformance passed", { check: name }).pipe(
        Effect.andThen(
          Effect.sync(() => {
            checks.push(name);
          }),
        ),
      );
    yield* use("seed owned fixtures", async () => {
      for (const id of [owner, other])
        await db.insert(user).values({
          id,
          name: "Conformance",
          email: `${id}@example.invalid`,
          createdAt: sql`now()`,
          updatedAt: sql`now()`,
        });
      for (const [id, userId] of [
        [first, owner],
        [second, owner],
        [otherFile, other],
      ] as const) {
        await db.insert(file).values({ id, userId, kind: "note", title: "Fixture", dedupeKey: id });
      }
      await db.insert(folder).values({ id: destination, userId: owner, name: "Owned folder" });
      for (const [id, fileId, embedding] of [
        [`${first}-a`, first, vector(0)],
        [`${first}-b`, first, vector(0)],
        [`${second}-a`, second, vector(1)],
      ] as const) {
        await db.insert(chunk).values({
          id,
          fileId,
          userId: owner,
          ordinal: id.endsWith("b") ? 1 : 0,
          kind: "concept",
          content: "Fixture",
          contentNorm: "fixture",
          contentHash: id,
          location: {},
          tokenCount: 2,
          embedding: [...embedding],
          embeddingModel: "test",
          search: sql`to_tsvector('simple', 'fixture')`,
        });
      }
    });
    yield* Effect.addFinalizer(() =>
      database
        .use((tx) => tx.delete(user).where(sql`${user.id} in (${owner}, ${other})`))
        .pipe(
          Effect.catchCause((cause) =>
            Effect.logError("Conformance fixture cleanup failed", cause),
          ),
        ),
    );

    yield* use("concurrent folder memberships", async () => {
      await Promise.all(
        [first, second].map((id) =>
          db.transaction((tx) => setFileFoldersTx(tx, owner, id, [destination])),
        ),
      );
      const saved = await db.query.folder.findFirst({ where: eq(folder.id, destination) });
      assert(saved?.centroid);
      assert(Math.abs(saved.centroid[0]! - 0.5) < 1e-6);
      assert(
        Math.abs(saved.centroid[1]! - 0.5) < 1e-6,
        "each file has equal weight regardless of chunk count",
      );
      await db.transaction((tx) => setFileFoldersTx(tx, owner, first, []));
      const afterMove = await db.query.folder.findFirst({ where: eq(folder.id, destination) });
      assert.equal(afterMove?.centroid?.[0], 0);
      assert.equal(afterMove?.centroid?.[1], 1);
      await db.transaction((tx) => setFileFoldersTx(tx, owner, second, []));
      assert.equal(
        (await db.query.folder.findFirst({ where: eq(folder.id, destination) }))?.centroid,
        null,
      );
    });
    yield* verified("concurrent folder aggregates, equal-file weighting and empty reset");

    yield* use("revision rollback", async () => {
      const before = (await db.query.user.findFirst({ where: eq(user.id, owner) }))!.corpusRevision;
      await assert.rejects(
        db.transaction(async (tx) => {
          await lockCorpus(tx, owner);
          await advanceCorpusRevision(tx, owner);
          throw new Error("fixture rollback");
        }),
      );
      assert.equal(
        (await db.query.user.findFirst({ where: eq(user.id, owner) }))!.corpusRevision,
        before,
      );
    });
    yield* verified("corpus revision rolls back with failed canonical mutation");

    yield* use("fresh claims and repeated enqueues", async () => {
      await db.insert(ingestionJob).values({
        id: jobId,
        userId: owner,
        fileId: first,
        status: "extracting",
        generation: 1,
        claimToken: "old-claim",
        lockedUntil: sql`now() + interval '10 minutes'`,
      });
      await db.transaction(async (tx) => {
        assert.equal(
          await ownsPublication(tx, {
            id: jobId,
            userId: owner,
            fileId: first,
            generation: 1,
            claimToken: "old-claim",
          }),
          true,
        );
        await enqueueIngestionTx(tx, owner, first, jobId);
        await enqueueIngestionTx(tx, owner, first, jobId);
      });
      const queued = (await db.query.ingestionJob.findFirst({
        where: eq(ingestionJob.id, jobId),
      }))!;
      assert(queued.lockedUntil && queued.lockedUntil > new Date());
      assert.equal(queued.claimToken, "old-claim");
      assert.equal((await claimJobs(db, 1, "premature-claim")).length, 0);
      await db
        .update(ingestionJob)
        .set({ lockedUntil: sql`now() - interval '1 second'` })
        .where(eq(ingestionJob.id, jobId));
      const claimed = await claimJobs(db, 1, "new-claim");
      assert.equal(claimed[0]?.claimToken, "new-claim");
      await db.transaction(async (tx) => {
        assert.equal(
          await ownsPublication(tx, {
            id: jobId,
            userId: owner,
            fileId: first,
            generation: queued.generation,
            claimToken: "old-claim",
          }),
          false,
        );
        assert.equal(
          await ownsPublication(tx, {
            id: jobId,
            userId: owner,
            fileId: first,
            generation: queued.generation,
            claimToken: "new-claim",
          }),
          true,
        );
      });
    });
    yield* verified("two enqueues preserve lease; reclaim fences prior worker");

    const cache = yield* SemanticCache.pipe(
      Effect.provide(SemanticCacheLive),
      Effect.provide(EmbedderTest),
      Effect.provideService(Database, database),
    );
    const revision = yield* use(
      "read current revision",
      async () => (await db.query.user.findFirst({ where: eq(user.id, owner) }))!.corpusRevision,
    );
    const key = { userId: owner, corpusRevision: revision, optionsKey: "fixture" };
    const entry = {
      queryText: "fixture",
      vector: vector(0),
      result: { hits: [], facts: [], aspects: [], reranked: true, abstained: true, cached: false },
    };
    yield* use("publish newer corpus", () =>
      db.transaction(async (tx) => {
        await lockCorpus(tx, owner);
        await advanceCorpusRevision(tx, owner);
      }),
    );
    yield* cache.store(key, entry);
    yield* use("reject stale cache publication", async () =>
      assert.equal(
        (await db.select().from(searchCache).where(eq(searchCache.userId, owner))).length,
        0,
      ),
    );
    yield* verified("in-flight stale search cannot repopulate current cache");

    yield* use("purge and restore serialization", async () => {
      const cutoff = new Date(Date.now() - 30 * 86400_000);
      await db
        .update(file)
        .set({ placement: "archived", archivedAt: sql`now() - interval '31 days'` })
        .where(eq(file.id, first));
      await db.transaction(async (tx) => {
        await lockCorpus(tx, owner);
        assert.equal((await restoreStatement(tx, owner, first)).length, 1);
      });
      assert.equal(
        (
          await db.transaction(async (tx) => {
            await lockCorpus(tx, owner);
            return claimPurgeStatement(tx, owner, first, cutoff);
          })
        ).length,
        0,
        "restored file cannot be claimed",
      );
      await db
        .update(file)
        .set({ placement: "archived", archivedAt: sql`now() - interval '31 days'` })
        .where(eq(file.id, first));
      assert.equal(
        (
          await db.transaction(async (tx) => {
            await lockCorpus(tx, owner);
            return claimPurgeStatement(tx, owner, first, cutoff);
          })
        ).length,
        1,
      );
      assert.equal(
        (
          await db.transaction(async (tx) => {
            await lockCorpus(tx, owner);
            return restoreStatement(tx, owner, first);
          })
        ).length,
        0,
        "claimed purge cannot be restored",
      );
    });
    yield* verified("purge claim and restore have mutually exclusive outcomes");

    yield* use("transcript ownership foreign key and cascade", async () => {
      const clip = {
        model: "fixture",
        contentHash: "same-audio",
        segments: [{ text: "Private fixture", startSec: 0, endSec: 1 }],
        expiresAt: sql`now() + interval '1 hour'`,
      };
      await db.insert(transcriptCache).values([
        { ...clip, userId: owner, fileId: second },
        { ...clip, userId: other, fileId: otherFile },
      ]);
      await assert.rejects(
        db.insert(transcriptCache).values({ ...clip, userId: other, fileId: second }),
        "cross-owner cache insert must fail",
      );
      await db.delete(file).where(and(eq(file.id, second), eq(file.userId, owner)));
      assert.equal(
        (await db.select().from(transcriptCache).where(eq(transcriptCache.userId, owner))).length,
        0,
      );
      assert.equal(
        (await db.select().from(transcriptCache).where(eq(transcriptCache.userId, other))).length,
        1,
      );
      await db.delete(user).where(eq(user.id, other));
      assert.equal(
        (await db.select().from(transcriptCache).where(eq(transcriptCache.userId, other))).length,
        0,
      );
    });
    yield* verified("transcript cache rejects mixed owners and cascades file/account deletion");

    const assets = AssetStore.of({
      list: () => Effect.succeed([]),
      get: () => Effect.succeedNone,
      put: () => Effect.die(new Error("Unexpected asset write in task retirement")),
      load: () => Effect.die(new Error("Unexpected asset read in task retirement")),
      url: () => "/fixture",
      resolve: () => Option.none(),
    });
    yield* use("seed retained Cloud obligations", async () => {
      await db.insert(cloudTask).values({
        id: taskId,
        userId: owner,
        title: "Retirement fixture",
        prompt: "Fixture",
        schedule: { _tag: "once", at: "2099-01-01T00:00:00Z" },
        delivery: { email: false },
      });
      await db.insert(cloudRun).values({
        id: taskId,
        taskId,
        userId: owner,
        status: "succeeded",
        scheduledFor: sql`now()`,
        leasedBy: "pending-cleanup",
        usage: { inputTokens: 0, outputTokens: 0, cost: 0, actions: 0, cleanupComplete: false },
      });
      await db.insert(pendingApproval).values({
        id: taskId,
        userId: owner,
        runId: taskId,
        fileId: first,
        baseHash: "base",
        proposedKey: "fixture",
        proposedHash: "proposal",
        proposedSize: 1,
        summary: "Fixture",
      });
    });
    const tasks = yield* CloudTasks.pipe(
      Effect.provide(CloudTasksLive),
      Effect.provideService(AssetStore, assets),
      Effect.provideService(Database, database),
    );
    yield* tasks.delete(owner, taskId);
    yield* use("verify task retirement retention", async () => {
      assert((await db.query.cloudTask.findFirst({ where: eq(cloudTask.id, taskId) }))?.retiredAt);
      assert(await db.query.cloudRun.findFirst({ where: eq(cloudRun.id, taskId) }));
      assert(await db.query.pendingApproval.findFirst({ where: eq(pendingApproval.id, taskId) }));
    });
    yield* verified("task retirement preserves pending review and cleanup recovery");
    yield* Effect.logInfo("Backend PostgreSQL conformance complete", {
      checks: checks.length,
      database: target.pathname.slice(1),
    });
  }),
).pipe(Effect.provide(NodeServices.layer));

NodeRuntime.runMain(main);
