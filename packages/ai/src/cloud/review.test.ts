import { CloudRunId, PendingApprovalId, StorageKey, UserId } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { Storage, StorageMemory } from "@avenire/storage/storage";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Crypto from "effect/Crypto";
import { testCrypto } from "../tools/test-support.ts";
import { cloudCtx, cloudFixture, fileId } from "./cloud-test-support.ts";
import { cloudTools } from "./tools.ts";
import { CloudReview, CloudReviewLive } from "./review.ts";

const setup = () => {
  const f = cloudFixture();
  f.rows("cloud_workspace_file").push(f.workspaceRow());
  const proposal = () =>
    cloudTools
      .publish_output({ sandboxPath: "report.md", replaces: fileId }, cloudCtx)
      .pipe(
        Effect.flatMap((result) =>
          result.kind === "sync" ? Effect.succeed(result.approvalId) : Effect.die("Expected sync"),
        ),
      );
  return { ...f, proposal };
};
it.effect(
  "accept writes a new key, repoints the file, records an edit, queues ingestion and removes proposal",
  () => {
    const f = setup();
    return Effect.gen(function* () {
      const storage = yield* Storage;
      yield* storage.put(StorageKey.make("original"), "input");
      yield* Effect.gen(function* () {
        const id = yield* f.proposal();
        const key = StorageKey.make(f.rows("pending_approval")[0]!.proposedKey as string);
        const review = yield* CloudReview;
        yield* review.resolve(cloudCtx.userId, id, "accept");
        // Storage keys are write-once: the accepted bytes get a new key and the old one is gone.
        const accepted = StorageKey.make(f.rows("file")[0]!.storageKey as string);
        expect(accepted).not.toBe("original");
        expect(accepted).toMatch(/^users\/user\/files\/.+\/source\/[0-9a-f]{12}-original$/);
        expect(new TextDecoder().decode(yield* storage.get(accepted))).toBe("# report");
        expect(f.storageWrites.filter((written) => written === "original")).toEqual([]);
        expect((yield* Effect.flip(storage.get(StorageKey.make("original"))))._tag).toBe(
          "ObjectNotFound",
        );
        expect(f.rows("pending_approval")[0]).toMatchObject({
          status: "accepted",
          resolvedAt: expect.any(Date),
        });
        expect(f.rows("file")[0]?.contentHash).toBe(f.rows("pending_approval")[0]?.proposedHash);
        expect(f.rows("file")[0]?.sizeBytes).toBe(8);
        expect(f.rows("file_event")[0]).toMatchObject({ fileId: fileId, kind: "edited" });
        expect(
          f.writes.some(
            (write) => write.table === "file" && write.values.contentModifiedAt !== undefined,
          ),
        ).toBe(true);
        expect(f.rows("ingestion_job")[0]).toMatchObject({ fileId: fileId, status: "queued" });
        expect(
          f.writes.filter(
            (write) => write.table === "user" && write.values.corpusRevision !== undefined,
          ),
        ).toHaveLength(1);
        expect(f.invalidated()).toBe(0);
        expect((yield* Effect.flip(storage.get(key)))._tag).toBe("ObjectNotFound");
        expect((yield* Effect.flip(review.resolve(cloudCtx.userId, id, "accept"))).message).toBe(
          "Already resolved",
        );
      }).pipe(Effect.provide(CloudReviewLive), Effect.provide(f.services(storage)));
    }).pipe(Effect.provide(StorageMemory));
  },
);
it.effect("accept rechecks the CURRENT hash; conflicts leave the original untouched", () => {
  const f = setup();
  return Effect.gen(function* () {
    const storage = yield* Storage;
    yield* storage.put(StorageKey.make("original"), "library changed");
    yield* Effect.gen(function* () {
      const id = yield* f.proposal();
      Object.assign(f.rows("file")[0]!, {
        contentHash: "changed-again",
        contentModifiedAt: new Date("2026-10-09"),
      });
      yield* (yield* CloudReview).resolve(cloudCtx.userId, id, "accept");
      expect(f.rows("pending_approval")[0]).toMatchObject({
        status: "conflict",
        conflict: "Changed in your library on 2026-10-09 after Ruth Cloud copied it",
        resolvedAt: null,
      });
      expect(new TextDecoder().decode(yield* storage.get(StorageKey.make("original")))).toBe(
        "library changed",
      );
      expect(f.storageWrites).not.toContain("original");
      expect(f.rows("file_event")).toHaveLength(0);
      expect(f.rows("ingestion_job")).toHaveLength(0);
      expect(f.invalidated()).toBe(0);
    }).pipe(Effect.provide(CloudReviewLive), Effect.provide(f.services(storage)));
  }).pipe(Effect.provide(StorageMemory));
});
it.effect("skip leaves originals intact and removes only that proposal", () => {
  const f = setup();
  return Effect.gen(function* () {
    const storage = yield* Storage;
    yield* storage.put(StorageKey.make("original"), "input");
    yield* Effect.gen(function* () {
      const first = yield* f.proposal();
      const second = yield* f.proposal();
      const firstKey = StorageKey.make(f.rows("pending_approval")[0]!.proposedKey as string);
      const secondKey = StorageKey.make(f.rows("pending_approval")[1]!.proposedKey as string);
      const review = yield* CloudReview;
      yield* review.resolve(cloudCtx.userId, first, "skip");
      expect(f.rows("pending_approval")[0]).toMatchObject({
        status: "skipped",
        resolvedAt: expect.any(Date),
      });
      expect((yield* Effect.flip(storage.get(firstKey)))._tag).toBe("ObjectNotFound");
      expect(new TextDecoder().decode(yield* storage.get(secondKey))).toBe("# report");
      expect((yield* review.list(cloudCtx.userId)).map((approval) => approval.id)).toEqual([
        second,
      ]);
      expect(new TextDecoder().decode(yield* storage.get(StorageKey.make("original")))).toBe(
        "input",
      );
      expect(f.invalidated()).toBe(0);
      expect((yield* Effect.flip(review.resolve(cloudCtx.userId, first, "skip")))._tag).toBe(
        "Conflict",
      );
    }).pipe(Effect.provide(CloudReviewLive), Effect.provide(f.services(storage)));
  }).pipe(Effect.provide(StorageMemory));
});
it.effect(
  "resolveRun handles pending/conflict approvals in the run and list includes titles newest first",
  () => {
    const f = setup();
    return Effect.gen(function* () {
      const storage = yield* Storage;
      yield* Effect.gen(function* () {
        const first = yield* f.proposal();
        const second = yield* f.proposal();
        Object.assign(f.rows("pending_approval")[0]!, {
          createdAt: new Date("2026-10-01"),
          status: "conflict",
          conflict: "Changed",
        });
        Object.assign(f.rows("pending_approval")[1]!, { createdAt: new Date("2026-10-02") });
        f.rows("pending_approval").push({
          ...f.rows("pending_approval")[0],
          id: "other-run",
          runId: "other-run",
          status: "pending",
        });
        const review = yield* CloudReview;
        const list = yield* review.list(cloudCtx.userId, cloudCtx.runId!);
        expect(list.map((approval) => approval.id)).toEqual([second, first]);
        expect(list[0]?.fileTitle).toBe("Lecture");
        yield* review.resolveRun(cloudCtx.userId, cloudCtx.runId!, "skip");
        expect(
          f
            .rows("pending_approval")
            .slice(0, 2)
            .every((approval) => approval.status === "skipped"),
        ).toBe(true);
        expect(f.rows("pending_approval")[2]?.status).toBe("pending");
      }).pipe(Effect.provide(CloudReviewLive), Effect.provide(f.services(storage)));
    }).pipe(Effect.provide(StorageMemory));
  },
);
it.effect("missing/other-user approval returns NotFound and never touches storage", () => {
  const f = setup();
  return Effect.gen(function* () {
    const storage = yield* Storage;
    yield* Effect.gen(function* () {
      const id = yield* f.proposal();
      const review = yield* CloudReview;
      expect(
        (yield* Effect.flip(review.resolve(UserId.make("other-user"), id, "accept")))._tag,
      ).toBe("NotFound");
      expect(
        (yield* Effect.flip(
          review.resolve(cloudCtx.userId, PendingApprovalId.make("missing"), "skip"),
        ))._tag,
      ).toBe("NotFound");
      expect(yield* review.list(UserId.make("other-user"))).toEqual([]);
      expect(f.storageWrites).toHaveLength(1);
      expect(f.rows("pending_approval")[0]?.status).toBe("pending");
    }).pipe(Effect.provide(CloudReviewLive), Effect.provide(f.services(storage)));
  }).pipe(Effect.provide(StorageMemory));
});

it.effect(
  "reviews a retired task through DB/storage alone and returns resolved wire approvals",
  () => {
    const f = cloudFixture();
    f.rows("cloud_task")[0]!.retiredAt = new Date(0);
    f.rows("pending_approval").push({
      id: "retained",
      userId: cloudCtx.userId,
      runId: "run",
      fileId,
      kind: "sync",
      status: "pending",
      conflict: null,
      summary: "Retained proposal",
      proposedKey: "proposal",
      proposedSize: 8,
      createdAt: new Date(0),
      resolvedAt: null,
    });
    return Effect.gen(function* () {
      const service = yield* CloudReview;
      const resolved = yield* service.resolveRun(cloudCtx.userId, CloudRunId.make("run"), "skip");
      expect(resolved).toMatchObject([
        { id: "retained", fileTitle: "Lecture", status: "skipped", resolvedAt: expect.any(String) },
      ]);
      expect(yield* service.list(cloudCtx.userId)).toEqual([]);
    }).pipe(
      Effect.provide(CloudReviewLive),
      Effect.provideService(Database, f.database),
      Effect.provideService(Crypto.Crypto, testCrypto),
      Effect.provide(StorageMemory),
    );
  },
);
