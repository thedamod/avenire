import { describe, expect, it, vi } from "vite-plus/test";
import type { FileId, Folder, FolderId } from "@avenire/contracts";
import { contextTargets } from "./contextTargets";
import { buildFileActions, type ActionFile, type FileActionHandlers } from "./fileActions";

const a = "a" as FileId;
const b = "b" as FileId;
const c = "c" as FileId;
const folderId = "notebook" as FolderId;
const note: ActionFile = { id: a, kind: "note", title: "Note", folderIds: [folderId] };
const source: ActionFile = { id: b, kind: "pdf", title: "Source", folderIds: [] };
function setup(
  files: readonly ActionFile[],
  options: Partial<Parameters<typeof buildFileActions>[0]> = {},
) {
  const handlers: FileActionHandlers = {
    move: vi.fn(),
    newNotebook: vi.fn(),
    ask: vi.fn(),
    download: vi.fn(),
    trash: vi.fn(),
    openInNewTab: vi.fn(),
    openOriginal: vi.fn(),
    copyLink: vi.fn(),
    toggleSelection: vi.fn(),
    rename: vi.fn(),
    removeFromNotebook: vi.fn(),
  };
  const actions = buildFileActions({ files, folders: [], handlers, href: "/notes/a", ...options });
  return { actions, handlers, ids: actions.map((action) => action.id) };
}

describe("contextTargets", () => {
  it("targets the whole selection for a selected row", () => {
    const selection = new Set([a, b]);
    expect(contextTargets(selection, b)).toEqual([a, b]);
    expect([...selection]).toEqual([a, b]);
  });
  it("targets only an unselected row without changing selection", () => {
    const selection = new Set([a, b]);
    expect(contextTargets(selection, c)).toEqual([c]);
    expect([...selection]).toEqual([a, b]);
    expect(contextTargets(new Set<FileId>(), a)).toEqual([a]);
  });
  it("also works with notebook or thread identifiers", () => {
    expect(contextTargets(new Set(["thread-1", "thread-2"]), "thread-2")).toEqual([
      "thread-1",
      "thread-2",
    ]);
  });
});

describe("buildFileActions", () => {
  it("offers note rename, download and single navigation", () => {
    const { actions, ids } = setup([note], { selected: false });
    expect(ids).toEqual([
      "open",
      "new-tab",
      "ask",
      "move",
      "rename",
      "download",
      "copy",
      "select",
      "trash",
    ]);
    expect(actions.find((action) => action.id === "move")?.label).toBe("Move to notebook");
    expect(actions.find((action) => action.id === "select")?.label).toBe("Select");
    expect(actions.find((action) => action.id === "open")?.href).toBe("/notes/a");
  });
  it("renames sources and hides new tab on phone", () => {
    const { ids, actions } = setup([source], { desktop: false, selected: true });
    expect(ids).toContain("rename");
    expect(actions.find((action) => action.id === "trash")?.label).toBe("Move to Trash");
    expect(ids).not.toContain("new-tab");
    expect(ids).toContain("download");
    expect(actions.find((action) => action.id === "select")?.label).toBe("Deselect");
  });
  it("pluralizes sources and removes single-only actions for multiple targets", () => {
    const { actions, ids } = setup([source, { ...source, id: c }, { ...source, id: a }]);
    expect(ids).not.toContain("open");
    expect(ids).not.toContain("new-tab");
    expect(ids).not.toContain("copy");
    expect(ids).not.toContain("rename");
    expect(actions.find((action) => action.id === "move")?.label).toBe("Move 3 sources to");
    expect(actions.find((action) => action.id === "ask")?.label).toBe("Ask Ava about them");
    expect(actions.find((action) => action.id === "trash")).toMatchObject({
      label: "Move 3 sources to Trash",
      destructive: true,
    });
  });
  it("uses notes and mixed item labels appropriately", () => {
    expect(
      setup([note, { ...note, id: c }]).actions.find((action) => action.id === "move")?.label,
    ).toBe("Move 2 notes to");
    expect(setup([note, source]).actions.find((action) => action.id === "move")?.label).toBe(
      "Move 2 items to",
    );
    expect(setup([]).actions).toEqual([]);
  });
  it("checks and disables a shared current notebook, and provides new notebook", () => {
    const folder = { id: folderId, name: "Physics" } as Folder;
    const { actions, handlers } = setup([note], { folders: [folder], currentFolderId: folderId });
    const children = actions.find((action) => action.id === "move")!.children!;
    expect(children[0]).toMatchObject({ label: "Physics", disabled: true });
    expect(children[0]?.icon).toBeDefined();
    children[1]?.onSelect?.();
    expect(handlers.newNotebook).toHaveBeenCalledOnce();
    expect(actions.some((action) => action.id === "remove")).toBe(true);
    expect(setup([note]).ids).not.toContain("remove");
    expect(setup([source], { currentFolderId: folderId }).ids).not.toContain("remove");
  });
  it("offers Open original only for a single source that has one", () => {
    const { actions, handlers, ids } = setup([source], { original: true });
    expect(ids.slice(0, 3)).toEqual(["open", "new-tab", "original"]);
    actions.find((action) => action.id === "original")?.onSelect?.();
    expect(handlers.openOriginal).toHaveBeenCalledOnce();
    expect(setup([source]).ids).not.toContain("original");
    expect(setup([note], { original: true }).ids).not.toContain("original");
    expect(setup([source, { ...source, id: c }], { original: true }).ids).not.toContain("original");
  });
  it("routes dock/menu actions through the same supplied handlers", () => {
    const folder = { id: folderId, name: "Physics" } as Folder;
    const { actions, handlers } = setup([source], { folders: [folder], selected: false });
    for (const id of ["ask", "download", "trash", "select", "copy", "new-tab"] as const)
      actions.find((action) => action.id === id)?.onSelect?.();
    actions.find((action) => action.id === "move")?.children?.[0]?.onSelect?.();
    expect(handlers.move).toHaveBeenCalledWith(folder);
    for (const key of [
      "ask",
      "download",
      "trash",
      "toggleSelection",
      "copyLink",
      "openInNewTab",
    ] as const)
      expect(handlers[key]).toHaveBeenCalledOnce();
  });
});
