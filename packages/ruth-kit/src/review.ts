/** Morning review is the only Cloud operation that writes to an existing library object. */
import {
  Conflict,
  NotFound,
  StorageKey,
  type ApprovalDecision,
  CloudRunId,
  type PendingApproval,
  PendingApprovalId,
  FileId,
  type UserId,
} from "@avenire/contracts";
import {
  Database,
  DatabaseError,
  type DatabaseClient,
  type DatabaseTransaction,
} from "@avenire/database/client";
import { file, pendingApproval, type PendingApprovalRow } from "@avenire/database/schema";
import { markContentChanged } from "@avenire/ingestion/events";
import { SemanticCache, type SearchCacheError } from "@avenire/ingestion/retrieval/cache";
import { enqueueIngestion } from "@avenire/ingestion/worker";
import { Storage, type ObjectNotFound, type StorageError } from "@avenire/storage/storage";
import { and, desc, eq, inArray } from "drizzle-orm";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as PlatformError from "effect/PlatformError";
import { detectConflict } from "./cloud-tools.ts";

export type CloudReviewError =
  | Conflict
  | NotFound
  | DatabaseError
  | StorageError
  | ObjectNotFound
  | SearchCacheError
  | PlatformError.PlatformError;
export class CloudReview extends Context.Service<
  CloudReview,
  {
    readonly list: (
      userId: UserId,
      runId?: CloudRunId,
    ) => Effect.Effect<readonly PendingApproval[], DatabaseError>;
    readonly resolve: (
      userId: UserId,
      approvalId: PendingApprovalId,
      decision: ApprovalDecision,
    ) => Effect.Effect<void, CloudReviewError>;
    readonly resolveRun: (
      userId: UserId,
      runId: CloudRunId,
      decision: ApprovalDecision,
    ) => Effect.Effect<void, CloudReviewError>;
  }
>()("avenire/ruth-kit/CloudReview") {}
const wireApproval = (row: PendingApprovalRow & { fileTitle: string }): PendingApproval => ({
  id: PendingApprovalId.make(row.id),
  runId: CloudRunId.make(row.runId),
  fileId: FileId.make(row.fileId),
  fileTitle: row.fileTitle,
  kind: row.kind,
  status: row.status,
  conflict: row.conflict,
  summary: row.summary,
  proposedSize: row.proposedSize,
  createdAt: row.createdAt.toISOString(),
  resolvedAt: row.resolvedAt?.toISOString() ?? null,
});

/** Reuse library helpers inside the same transaction, without opening another connection. */
const transactionDatabase = (tx: DatabaseTransaction): Database["Service"] => {
  // Drizzle's transaction exposes the same query builders; only transaction ownership differs.
  const db = tx as unknown as DatabaseClient;
  return Database.of({
    db,
    use: (fn) =>
      Effect.tryPromise({ try: () => fn(db), catch: (cause) => new DatabaseError({ cause }) }),
    useTransaction: (fn) =>
      Effect.tryPromise({ try: () => fn(tx), catch: (cause) => new DatabaseError({ cause }) }),
  });
};

export const CloudReviewLive = Layer.effect(
  CloudReview,
  Effect.gen(function* () {
    const database = yield* Database;
    const storage = yield* Storage;
    const cache = yield* SemanticCache;
    const crypto = yield* Crypto.Crypto;
    const list = Effect.fn("CloudReview.list")(function* (userId: UserId, runId?: CloudRunId) {
      const rows = yield* database.use((db) =>
        db
          .select({ approval: pendingApproval, fileTitle: file.title })
          .from(pendingApproval)
          .innerJoin(file, and(eq(pendingApproval.fileId, file.id), eq(file.userId, userId)))
          .where(
            and(
              eq(pendingApproval.userId, userId),
              inArray(pendingApproval.status, ["pending", "conflict"]),
              ...(runId === undefined ? [] : [eq(pendingApproval.runId, runId)]),
            ),
          )
          .orderBy(desc(pendingApproval.createdAt), desc(pendingApproval.id)),
      );
      return rows.map(({ approval, fileTitle }) => wireApproval({ ...approval, fileTitle }));
    });
    const cleanup = (key: string) =>
      storage
        .remove(StorageKey.make(key))
        .pipe(
          Effect.catchTag("StorageError", (error) =>
            Effect.logWarning("Could not remove resolved Cloud proposal", error),
          ),
        );
    const resolve = Effect.fn("CloudReview.resolve")(function* (
      userId: UserId,
      approvalId: PendingApprovalId,
      decision: ApprovalDecision,
    ) {
      const approval = yield* database.use((db) =>
        db.query.pendingApproval.findFirst({
          where: and(eq(pendingApproval.id, approvalId), eq(pendingApproval.userId, userId)),
        }),
      );
      if (!approval) return yield* new NotFound({ entity: "PendingApproval", id: approvalId });
      if (approval.resolvedAt !== null || !["pending", "conflict"].includes(approval.status))
        return yield* new Conflict({ reason: "Already resolved" });
      const now = DateTime.toDateUtc(yield* DateTime.now);
      const outcome = yield* database.useTransaction(async (tx) => {
        const where = and(eq(pendingApproval.id, approvalId), eq(pendingApproval.userId, userId));
        const [current] = await tx.select().from(pendingApproval).where(where).for("update");
        if (!current) return { kind: "missing" as const };
        if (current.resolvedAt !== null || !["pending", "conflict"].includes(current.status))
          return { kind: "resolved" as const };
        if (decision === "skip") {
          await tx.update(pendingApproval).set({ status: "skipped", resolvedAt: now }).where(where);
          return { kind: "skipped" as const };
        }
        const [original] = await tx
          .select()
          .from(file)
          .where(and(eq(file.id, current.fileId), eq(file.userId, userId)))
          .for("update");
        if (!original) return { kind: "missingFile" as const };
        const conflict = !original.storageKey
          ? "This file can't be updated in place"
          : detectConflict(current.baseHash, original.contentHash, original.contentModifiedAt);
        if (conflict) {
          await tx.update(pendingApproval).set({ status: "conflict", conflict }).where(where);
          // Unresolved conflicts retain their proposal so review can still skip or retry them.
          return { kind: "conflict" as const };
        }
        // The SDK promise transaction owns both row locks during the external object write.
        // This bridge prevents another review/server from accepting against a stale file hash.
        const bytes = await Effect.runPromise(storage.get(StorageKey.make(current.proposedKey)));
        await Effect.runPromise(
          storage.put(
            StorageKey.make(original.storageKey!),
            bytes,
            original.mimeType ? { contentType: original.mimeType } : undefined,
          ),
        );
        await tx
          .update(file)
          .set({ contentHash: current.proposedHash, sizeBytes: bytes.byteLength })
          .where(and(eq(file.id, original.id), eq(file.userId, userId)));
        const fileId = FileId.make(original.id);
        const services = Context.make(Database, transactionDatabase(tx)).pipe(
          Context.add(Crypto.Crypto, crypto),
        );
        await Effect.runPromiseWith(services)(
          markContentChanged(userId, fileId, current.proposedHash),
        );
        await Effect.runPromiseWith(services)(enqueueIngestion(userId, fileId));
        await tx
          .update(pendingApproval)
          .set({ status: "accepted", conflict: null, resolvedAt: now })
          .where(where);
        return { kind: "accepted" as const };
      });
      if (outcome.kind === "missing")
        return yield* new NotFound({ entity: "PendingApproval", id: approvalId });
      if (outcome.kind === "missingFile")
        return yield* new NotFound({ entity: "File", id: approval.fileId });
      if (outcome.kind === "resolved") return yield* new Conflict({ reason: "Already resolved" });
      if (outcome.kind === "conflict") return;
      if (outcome.kind === "accepted") {
        yield* cache.invalidate(userId).pipe(Effect.ensuring(cleanup(approval.proposedKey)));
        return;
      }
      yield* cleanup(approval.proposedKey);
    }, Effect.uninterruptible);
    return CloudReview.of({
      list,
      resolve,
      resolveRun: Effect.fn("CloudReview.resolveRun")(function* (userId, runId, decision) {
        const approvals = yield* list(userId, runId);
        for (const approval of approvals) yield* resolve(userId, approval.id, decision);
      }),
    });
  }),
);
