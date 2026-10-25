import { describe, expect, it, vi } from "vite-plus/test";
import type { FolderId, LibraryFile } from "@avenire/contracts";
import { buildNotebookActions, type NotebookActionId } from "./notebookActions";
import { notebookDeleteCopy, notebookTrashFiles } from "./notebookDeletion";

const id = "a" as FolderId;
const other = "b" as FolderId;
const archived = "archived" as FolderId;
describe("notebook actions", () => {
  it("offers navigation, scoped creation and management through the supplied handlers", () => {
    const handlers = Object.fromEntries(
      ["new-tab", "new-note", "ask", "rename", "cover", "copy", "delete"].map((key) => [
        key,
        vi.fn<() => void>(),
      ]),
    ) as Record<Exclude<NotebookActionId, "open">, ReturnType<typeof vi.fn<() => void>>>;
    const actions = buildNotebookActions("/notebooks/a", handlers);
    expect(actions.map((action) => action.id)).toEqual([
      "open",
      "new-tab",
      "new-note",
      "ask",
      "rename",
      "cover",
      "copy",
      "delete",
    ]);
    expect(actions[0]?.href).toBe("/notebooks/a");
    for (const action of actions) {
      action.onSelect?.();
      if (action.id !== "open") expect(handlers[action.id]).toHaveBeenCalledOnce();
    }
    expect(actions.filter((action) => action.destructive).map((action) => action.id)).toEqual([
      "delete",
    ]);
  });
});
describe("notebook deletion", () => {
  it("sweeps only active members with no other active notebook, including sources", () => {
    const file = (
      kind: LibraryFile["kind"],
      folderIds: FolderId[],
      placement: LibraryFile["placement"] = "filed",
    ) => ({ kind, folderIds, placement });
    const note = file("note", [id]);
    const source = file("pdf", [id, archived]);
    const files = [
      note,
      source,
      file("note", [id, other]),
      file("pdf", [id], "archived"),
      file("note", [other]),
    ];
    expect(notebookTrashFiles(files, id, new Set([id, other]))).toEqual([note, source]);
  });
  it("states exact counts, retained files and restoration behavior", () => {
    expect(notebookDeleteCopy(3, 2)).toBe(
      "3 notes and 2 sources move to Trash with it. Files also in other active notebooks stay in your library. Restoring this notebook also restores the files moved with it. You can restore them from Trash for 30 days.",
    );
    expect(notebookDeleteCopy(1, 1)).toContain("1 note and 1 source");
    expect(notebookDeleteCopy(0, 0)).toContain("0 notes and 0 sources");
  });
});
