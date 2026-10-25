import { FileId, FolderId, UserId, StorageKey } from "@avenire/contracts";
import { Storage, StorageMemory } from "@avenire/storage/storage";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { vi } from "vite-plus/test";
import { recordingDatabase, fakeCrypto } from "../../../../packages/ai/src/cloud-test-support.ts";
import { makeLibraryFeatures } from "./libraryFeatures.ts";

// Vector aggregation is covered by ingestion tests; this fixture exercises the lifecycle itself.
vi.mock("@avenire/database/corpus", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@avenire/database/corpus")>()),
  refreshFolderCentroidsTx: async () => {},
}));
const owner = UserId.make("owner"),
  other = UserId.make("other");
const noteId = FileId.make("note"),
  folderId = FolderId.make("notebook"),
  sharedId = FolderId.make("shared");
const oldKey = StorageKey.make("users/owner/files/note/source/old-note.md");
const fixture = (storage: Storage["Service"]) => {
  const f = recordingDatabase();
  f.rows("user").push({ id: owner });
  f.rows("file").push({
    id: noteId,
    userId: owner,
    title: "Note",
    kind: "note",
    storageKey: oldKey,
    noteRevision: "original",
    placement: "filed",
    archivedAt: null,
    archivedViaFolderId: null,
    purgeRequestedAt: null,
    purgeStartedAt: null,
    updatedAt: new Date(0),
  });
  const service = makeLibraryFeatures(
    f.database,
    storage,
    fakeCrypto,
    () => Effect.die("unused getFile"),
    () => Effect.die("unused folders"),
    () => Effect.die("unused wireFiles"),
  );
  return { ...f, service };
};
it.effect(
  "note saves use fresh keys, accept empty markdown and reject stale revisions before or during publication",
  () =>
    Effect.gen(function* () {
      const storage = yield* Storage;
      const f = fixture(storage);
      yield* storage.put(oldKey, "old");
      const saved = yield* f.service.saveNote(owner, {
        fileId: noteId,
        markdown: "",
        baseRevision: "original",
      });
      expect(saved.markdown).toBe("");
      expect(saved.revision).not.toBe("original");
      expect(f.rows("file")[0]!.storageKey).not.toBe(oldKey);
      expect(f.rows("file")[0]!.preview).toBe("");
      expect(f.rows("file_event")[0]!.kind).toBe("edited");
      expect(f.rows("ingestion_job")).toHaveLength(1);
      expect((yield* f.service.getNote(owner, noteId)).revision).toBe(saved.revision);
      expect(
        yield* f.service
          .saveNote(owner, { fileId: noteId, markdown: "stale", baseRevision: "original" })
          .pipe(Effect.result),
      ).toMatchObject({ failure: { _tag: "Conflict" } });
      expect(f.rows("ingestion_job")).toHaveLength(1);
      const racing = makeLibraryFeatures(
        f.database,
        {
          ...storage,
          put: (key, body, options) =>
            storage.put(key, body, options).pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  f.rows("file")[0]!.noteRevision = "another-writer";
                }),
              ),
            ),
        },
        fakeCrypto,
        () => Effect.die("unused"),
        () => Effect.die("unused"),
        () => Effect.die("unused"),
      );
      expect(
        yield* racing
          .saveNote(owner, { fileId: noteId, markdown: "loser", baseRevision: saved.revision })
          .pipe(Effect.result),
      ).toMatchObject({ failure: { _tag: "Conflict" } });
      expect(f.rows("file")[0]!.noteRevision).toBe("another-writer");
      expect(yield* storage.list(StorageKey.make("users/owner/files/note/"))).toHaveLength(1);
    }).pipe(Effect.provide(StorageMemory)),
);

it.effect(
  "notebook trash sweeps exclusive files, retains shared and foreign files, restores together and rejects claimed deletion",
  () =>
    Effect.gen(function* () {
      const f = fixture(yield* Storage);
      f.rows("folder").push(
        { id: folderId, userId: owner, archivedAt: null, purgeStartedAt: null },
        { id: sharedId, userId: owner, archivedAt: null, purgeStartedAt: null },
      );
      f.rows("file").push(
        { ...f.rows("file")[0], id: "shared-note" },
        { ...f.rows("file")[0], id: "foreign-note", userId: other },
      );
      f.rows("file_folder").push(
        { userId: owner, fileId: noteId, folderId },
        { userId: owner, fileId: "shared-note", folderId },
        { userId: owner, fileId: "shared-note", folderId: sharedId },
        { userId: other, fileId: "foreign-note", folderId },
      );
      yield* f.service.trashFolder(owner, folderId);
      expect(f.rows("folder")[0]!.archivedAt).toBeInstanceOf(Date);
      expect(f.rows("file")[0]).toMatchObject({
        placement: "archived",
        archivedViaFolderId: folderId,
      });
      expect(f.rows("file")[1]!.placement).toBe("filed");
      expect(f.rows("file")[2]!.placement).toBe("filed");
      yield* f.service.restore(owner, [{ _tag: "folder", id: folderId }]);
      expect(f.rows("folder")[0]!.archivedAt).toBeNull();
      expect(f.rows("file")[0]).toMatchObject({
        placement: "filed",
        archivedAt: null,
        archivedViaFolderId: null,
      });
      yield* f.service.trashFolder(owner, folderId);
      f.rows("file")[0]!.purgeStartedAt = new Date();
      expect(
        yield* f.service.restore(owner, [{ _tag: "folder", id: folderId }]).pipe(Effect.result),
      ).toMatchObject({ failure: { _tag: "Conflict" } });
      expect(f.rows("folder")[0]!.archivedAt).toBeInstanceOf(Date);
    }).pipe(Effect.provide(StorageMemory)),
);
