import { createHash } from "node:crypto";
import { FileId, StorageKey } from "@avenire/contracts";
import { CLOUD_WORKSPACE } from "@avenire/cloud/cloud-box";
import { Storage, StorageMemory } from "@avenire/storage/storage";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { cloudFixture, cloudCtx, fileId, candidate } from "./cloud-test-support.ts";
import { cloudTools, hydrate } from "./tools.ts";

it.effect("hydrates originals, touches skips, records the manifest and evicts old files", () => {
  const f = cloudFixture();
  f.addOld();
  f.rows("file")[0]!.contentHash = createHash("sha256").update("input").digest("hex");
  return Effect.gen(function* () {
    const storage = yield* Storage;
    yield* storage.put(StorageKey.make("original"), new TextEncoder().encode("input"));
    yield* Effect.gen(function* () {
      const result = yield* hydrate(cloudCtx, { selector: {} }, "pre-hydration");
      expect(result.files).toHaveLength(1);
      expect(result.totalBytes).toBe(5);
      expect(result.files[0]?.skipped).toBe(false);
      expect(f.written).toEqual([result.files[0]?.sandboxPath]);
      expect(f.removed).toContain(`${CLOUD_WORKSPACE}/inputs/old`);
      expect(f.rows("cloud_hydration")[0]).toMatchObject({
        trigger: "pre-hydration",
        runId: "run",
        files: result.files,
        totalBytes: 5,
      });
      const again = yield* hydrate(cloudCtx, { selector: {} }, "agent");
      expect(again.files[0]?.skipped).toBe(true);
      expect(again.totalBytes).toBe(0);
      expect(f.written).toHaveLength(1);
      expect(f.rows("cloud_workspace_file")[0]).toMatchObject({ lastRunId: "run" });
      expect(f.rows("cloud_hydration")).toHaveLength(2);
    }).pipe(Effect.provide(f.services(storage)));
  }).pipe(Effect.provide(StorageMemory));
});
it.effect("text-only/media files hydrate extracted markdown with its own hash", () => {
  const f = cloudFixture();
  Object.assign(f.rows("file")[0]!, { kind: "video", title: "Lecture.mp4" });
  f.metadata.splice(0, 1, candidate(fileId, { kind: "video", title: "Lecture.mp4" }));
  return Effect.gen(function* () {
    const storage = yield* Storage;
    const result = yield* hydrate(cloudCtx, { selector: {} }, "agent").pipe(
      Effect.provide(f.services(storage)),
    );
    expect(result.files[0]?.sandboxPath).toMatch(/\.md$/);
    expect(result.files[0]?.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(new TextDecoder().decode(f.files.get(result.files[0]!.sandboxPath))).toBe(
      "# extracted text",
    );
    const again = yield* hydrate(cloudCtx, { selector: {} }, "agent").pipe(
      Effect.provide(f.services(storage)),
    );
    expect(again.files[0]?.skipped).toBe(true);
  }).pipe(Effect.provide(StorageMemory));
});
it.effect("publishes two new files into one run folder with events and ingestion", () => {
  const f = cloudFixture();
  return Effect.gen(function* () {
    const storage = yield* Storage;
    yield* Effect.gen(function* () {
      const first = yield* cloudTools.publish_output(
        { sandboxPath: "report.md", title: "Report" },
        cloudCtx,
      );
      const second = yield* cloudTools.publish_output({ sandboxPath: "report.md" }, cloudCtx);
      expect(first.kind).toBe("file");
      expect(second.kind).toBe("file");
      expect(f.rows("folder")).toHaveLength(1);
      expect(f.rows("folder")[0]?.name).toMatch(/^Ruth Cloud · \d{4}-\d{2}-\d{2} · Morning$/);
      expect(f.rows("file_folder")).toHaveLength(2);
      expect(f.rows("cloud_run")[0]?.folderId).toBe(f.rows("folder")[0]?.id);
      expect(f.rows("file").slice(1)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "note",
            source: "ruth-cloud",
            placement: "filed",
            sizeBytes: 8,
          }),
        ]),
      );
      expect(
        f.writes.filter(
          (write) => write.table === "file_event" && write.values.kind === "uploaded",
        ),
      ).toHaveLength(2);
      expect(f.rows("ingestion_job")).toHaveLength(2);
      expect(f.invalidated()).toBe(2);
      expect(
        new TextDecoder().decode(
          yield* storage.get(StorageKey.make(f.rows("file")[1]!.storageKey as string)),
        ),
      ).toBe("# report");
    }).pipe(Effect.provide(f.services(storage)));
  }).pipe(Effect.provide(StorageMemory));
});
it.effect("rejects replaces without hydration and unowned replacement files", () => {
  const f = cloudFixture();
  return Effect.gen(function* () {
    const storage = yield* Storage;
    for (const replaces of [fileId, FileId.make("unowned")]) {
      expect(
        yield* Effect.flip(
          cloudTools
            .publish_output({ sandboxPath: "report.md", replaces }, cloudCtx)
            .pipe(Effect.provide(f.services(storage))),
        ),
      ).toMatchObject({
        code: "invalid_input",
        message: "Hydrate the file before proposing changes to it",
      });
    }
    expect(f.storageWrites).toHaveLength(0);
  }).pipe(Effect.provide(StorageMemory));
});
it.effect(
  "replacement proposals flag changes, never overwrite originals, and have distinct keys",
  () => {
    const f = cloudFixture();
    f.rows("cloud_workspace_file").push(f.workspaceRow());
    Object.assign(f.rows("file")[0]!, { contentHash: "changed" });
    return Effect.gen(function* () {
      const storage = yield* Storage;
      yield* storage.put(StorageKey.make("original"), "input");
      yield* Effect.gen(function* () {
        const first = yield* cloudTools.publish_output(
          { sandboxPath: "report.md", replaces: fileId },
          cloudCtx,
        );
        const second = yield* cloudTools.publish_output(
          { sandboxPath: "report.md", replaces: fileId },
          cloudCtx,
        );
        expect(first).toMatchObject({
          kind: "sync",
          conflict: expect.stringContaining("Changed in your library"),
        });
        expect(second.kind).toBe("sync");
        expect(f.rows("pending_approval")).toHaveLength(2);
        expect(f.rows("pending_approval")[0]).toMatchObject({
          status: "conflict",
          baseHash: "base",
          proposedSize: 8,
        });
        expect(f.rows("pending_approval")[0]?.proposedKey).not.toBe(
          f.rows("pending_approval")[1]?.proposedKey,
        );
        expect(f.storageWrites.every((key) => key.startsWith("users/user/.avenire/cloud/"))).toBe(
          true,
        );
        expect(new TextDecoder().decode(yield* storage.get(StorageKey.make("original")))).toBe(
          "input",
        );
        expect(f.invalidated()).toBe(0);
        expect(f.rows("file")).toHaveLength(1);
      }).pipe(Effect.provide(f.services(storage)));
    }).pipe(Effect.provide(StorageMemory));
  },
);
it.effect("publish_report publishes private assets and persists the markdown summary", () => {
  const f = cloudFixture();
  return Effect.gen(function* () {
    const storage = yield* Storage;
    const result = yield* cloudTools
      .publish_report({ markdown: "Finished", assets: ["report.md"] }, cloudCtx)
      .pipe(Effect.provide(f.services(storage)));
    expect(result.published).toHaveLength(1);
    expect(result.published[0]?.sandboxPath).toBe("report.md");
    expect(result.published[0]?.url).toContain("/a/");
    expect(f.rows("asset")[0]).toMatchObject({ kind: "file", runId: "run", visibility: "private" });
    const key = String(f.rows("asset")[0]?.storageKey);
    expect(key).toContain("/.avenire/assets/");
    expect((yield* storage.head(StorageKey.make(key))).contentType).toBe("text/markdown");
    expect(f.rows("cloud_run")[0]?.summary).toBe("Finished");
  }).pipe(Effect.provide(StorageMemory));
});

it.effect(
  "reconciles hydrated and published records when a completed side-effect result was lost",
  () => {
    const f = cloudFixture();
    const call = { ...cloudCtx, toolCallId: "lost-result" };
    return Effect.gen(function* () {
      const storage = yield* Storage;
      yield* storage.put(StorageKey.make("original"), new TextEncoder().encode("input"));
      yield* Effect.gen(function* () {
        const firstHydration = yield* hydrate(call, { selector: {} }, "agent");
        expect(yield* hydrate(call, { selector: {} }, "agent")).toEqual(firstHydration);
        expect(f.written).toHaveLength(1);
        expect(f.rows("cloud_hydration")).toHaveLength(1);
        const firstPublish = yield* cloudTools.publish_output({ sandboxPath: "report.md" }, call);
        expect(yield* cloudTools.publish_output({ sandboxPath: "report.md" }, call)).toEqual(
          firstPublish,
        );
        expect(f.rows("file").filter((row) => row.source === "ruth-cloud")).toHaveLength(1);
        expect(f.rows("folder")).toHaveLength(1);
        expect(f.rows("ingestion_job")).toHaveLength(1);
        expect(f.rows("file_event").filter((row) => row.kind === "uploaded")).toHaveLength(1);
      }).pipe(Effect.provide(f.services(storage)));
    }).pipe(Effect.provide(StorageMemory));
  },
);

it.effect("rehydrates a same-length input modified by a sandbox command", () => {
  const f = cloudFixture();
  f.rows("file")[0]!.contentHash = createHash("sha256").update("input").digest("hex");
  return Effect.gen(function* () {
    const storage = yield* Storage;
    yield* storage.put(StorageKey.make("original"), "input");
    yield* Effect.gen(function* () {
      const initial = yield* hydrate(cloudCtx, { selector: {} }, "agent");
      const path = initial.files[0]!.sandboxPath;
      f.files.set(path, new TextEncoder().encode("wrong"));
      const restored = yield* hydrate(
        { ...cloudCtx, toolCallId: "new-call" },
        { selector: {} },
        "agent",
      );
      expect(restored.files[0]?.skipped).toBe(false);
      expect(new TextDecoder().decode(f.files.get(path))).toBe("input");
      expect(f.written).toHaveLength(2);
    }).pipe(Effect.provide(f.services(storage)));
  }).pipe(Effect.provide(StorageMemory));
});
