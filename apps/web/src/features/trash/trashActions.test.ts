import { describe, expect, it, vi } from "vite-plus/test";
import { contextTargets } from "../library/contextTargets";
import { buildTrashActions } from "./trashActions";

const handlers = { restore: vi.fn(), purge: vi.fn() };
describe("trash actions", () => {
  it("offers only restore and permanent deletion for one item", () => {
    const actions = buildTrashActions(1, handlers);
    expect(actions.map((action) => action.label)).toEqual(["Restore", "Delete permanently"]);
    expect(actions[0]?.destructive).toBeUndefined();
    expect(actions[1]?.destructive).toBe(true);
    actions[0]?.onSelect?.();
    actions[1]?.onSelect?.();
    expect(handlers.restore).toHaveBeenCalledOnce();
    expect(handlers.purge).toHaveBeenCalledOnce();
  });
  it("pluralizes a mixed file/notebook selection for menus and the dock", () => {
    const selected = new Set(["file:a", "folder:b", "file:c"]);
    expect(
      buildTrashActions(contextTargets(selected, "folder:b").length, handlers).map(
        (action) => action.label,
      ),
    ).toEqual(["Restore 3 items", "Delete 3 items permanently"]);
    expect(buildTrashActions(contextTargets(selected, "file:d").length, handlers)[0]?.label).toBe(
      "Restore",
    );
    expect(selected.size).toBe(3);
  });
  it("offers nothing for empty selection and disables both actions while busy", () => {
    expect(buildTrashActions(0, handlers)).toEqual([]);
    expect(buildTrashActions(2, handlers, true).every((action) => action.disabled)).toBe(true);
  });
});
