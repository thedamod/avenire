import { describe, expect, it, vi } from "vite-plus/test";
import type { CloudTaskId } from "@avenire/contracts";
import { buildActivityActions, buildTaskActions } from "./activityActions";

const handlers = { newTab: vi.fn(), copy: vi.fn(), rename: vi.fn(), remove: vi.fn() };
const taskHandlers = { run: vi.fn(), toggle: vi.fn(), edit: vi.fn(), remove: vi.fn() };
const task = { id: "task" as CloudTaskId, enabled: true, builtin: null };

describe("activity row actions", () => {
  it("offers chat navigation, rename, copy and confirmed deletion, with no unsupported move", () => {
    const actions = buildActivityActions({ kind: "chat", href: "/chat/a", handlers });
    expect(actions.map((action) => action.label)).toEqual([
      "Open",
      "Open in new tab",
      "Rename…",
      "Copy link",
      "Delete chat",
    ]);
    expect(actions[0]?.href).toBe("/chat/a");
    expect(actions.at(-1)?.destructive).toBe(true);
    actions[2]?.onSelect?.();
    expect(handlers.rename).toHaveBeenCalledOnce();
  });
  it.each([true, false])("offers read-only run actions (succeeded=%s)", (succeeded) => {
    const actions = buildActivityActions({
      kind: "run",
      href: succeeded ? "/report/a" : "/tasks/a",
      succeeded,
      handlers,
    });
    expect(actions.map((action) => action.label)).toEqual([
      succeeded ? "Open report" : "Open",
      "Copy link",
    ]);
    expect(actions.every((action) => !action.destructive)).toBe(true);
  });
  it("disables chat mutations during a request but preserves navigation and copy", () => {
    const actions = buildActivityActions({ kind: "chat", href: "/chat/a", busy: true, handlers });
    expect(actions.filter((action) => action.disabled).map((action) => action.label)).toEqual([
      "Rename…",
      "Delete chat",
    ]);
  });
});

describe("scheduled task actions", () => {
  it.each([true, false])("offers the correct enabled-state control (%s)", (enabled) => {
    const actions = buildTaskActions({ ...task, enabled }, false, taskHandlers);
    expect(actions.map((action) => action.label)).toEqual([
      "Open",
      "Run now",
      enabled ? "Pause" : "Resume",
      "Edit schedule…",
      "Delete task",
    ]);
    expect(actions[0]?.href).toBe("/tasks/task");
    expect(actions.at(-1)?.destructive).toBe(true);
    actions[2]?.onSelect?.();
    expect(taskHandlers.toggle).toHaveBeenCalled();
  });
  it("keeps the builtin digest manageable without offering deletion", () => {
    expect(
      buildTaskActions({ ...task, builtin: "nightly-digest" }, false, taskHandlers).map(
        (action) => action.label,
      ),
    ).toEqual(["Open", "Run now", "Pause", "Edit schedule…"]);
  });
  it("disables every mutation while busy", () => {
    const actions = buildTaskActions(task, true, taskHandlers);
    expect(actions[0]?.disabled).toBeUndefined();
    expect(actions.slice(1).every((action) => action.disabled)).toBe(true);
  });
});
