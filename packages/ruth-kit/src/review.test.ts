import { PendingApprovalId, StorageKey, UserId } from "@avenire/contracts";
import { Storage, StorageMemory, StorageError } from "@avenire/storage/storage";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { cloudCtx, cloudFixture, fileId } from "./cloud-test-support.ts";
import { cloudTools } from "./cloud-tools.ts";
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
  "accept replaces the original, records an edit, queues ingestion and removes proposal",
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
        expect(new TextDecoder().decode(yield* storage.get(StorageKey.make("original")))).toBe(
          "# report",
        );
        expect(f.rows("pending_approval")[0]).toMatchObject({
          status: "accepted",
          resolvedAt: expect.any(Date),
        });
        expect(f.rows("item")[0]?.contentHash).toBe(f.rows("pending_approval")[0]?.proposedHash);
        expect(f.rows("item")[0]?.sizeBytes).toBe(8);
        expect(f.rows("item_event")[0]).toMatchObject({ itemId: fileId, kind: "edited" });
        expect(
          f.writes.some(
            (write) => write.table === "item" && write.values.contentModifiedAt !== undefined,
          ),
        ).toBe(true);
        expect(f.rows("ingestion_job")[0]).toMatchObject({ itemId: fileId, status: "queued" });
        expect(f.invalidated()).toBe(1);
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
      Object.assign(f.rows("item")[0]!, {
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
      expect(f.rows("item_event")).toHaveLength(0);
      expect(f.rows("ingestion_job")).toHaveLength(0);
      expect(f.invalidated()).toBe(0);
    }).pipe(Effect.provide(CloudReviewLive), Effect.provide(f.services(storage)));
  }).pipe(Effect.provide(StorageMemory));
});
it.effect("items without original storage become a conflict without trying to write", () => {
  const f = setup();
  return Effect.gen(function* () {
    const storage = yield* Storage;
    yield* Effect.gen(function* () {
      const id = yield* f.proposal();
      Object.assign(f.rows("item")[0]!, { storageKey: null });
      yield* (yield* CloudReview).resolve(cloudCtx.userId, id, "accept");
      expect(f.rows("pending_approval")[0]).toMatchObject({
        status: "conflict",
        conflict: "This file can't be updated in place",
      });
      expect(f.storageWrites).toHaveLength(1);
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
        expect(list[0]?.itemTitle).toBe("Lecture");
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
it.effect("best-effort cleanup failure does not fail a skip", () => {
  const f = setup();
  return Effect.gen(function* () {
    const storage = yield* Storage;
    yield* Effect.gen(function* () {
      const id = yield* f.proposal();
      yield* (yield* CloudReview).resolve(cloudCtx.userId, id, "skip");
      expect(f.rows("pending_approval")[0]?.status).toBe("skipped");
    }).pipe(
      Effect.provide(CloudReviewLive),
      Effect.provide(
        f.services({
          ...storage,
          remove: () =>
            Effect.fail(
              new StorageError({ operation: "remove", cause: "simulated cleanup failure" }),
            ),
        }),
      ),
    );
  }).pipe(Effect.provide(StorageMemory));
});
