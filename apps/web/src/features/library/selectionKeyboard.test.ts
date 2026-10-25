import { describe, expect, it } from "vite-plus/test";
import { shouldTrashSelection } from "./selectionKeyboard";
const key = {
  key: "Delete",
  defaultPrevented: false,
  isComposing: false,
  repeat: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
};
describe("selection keyboard deletion", () => {
  it("accepts Delete, Backspace and Command-Backspace for an active selection", () => {
    for (const event of [
      key,
      { ...key, key: "Backspace" },
      { ...key, key: "Backspace", metaKey: true },
    ])
      expect(shouldTrashSelection(event, 2, false, false)).toBe(true);
  });
  it("does not delete while editing, using a menu/dialog, or without a selection", () => {
    expect(shouldTrashSelection(key, 0, false, false)).toBe(false);
    expect(shouldTrashSelection(key, 1, true, false)).toBe(false);
    expect(shouldTrashSelection(key, 1, false, true)).toBe(false);
  });
  it("leaves handled, composing, repeated and modified shortcuts alone", () => {
    for (const flag of [
      "defaultPrevented",
      "isComposing",
      "repeat",
      "altKey",
      "ctrlKey",
      "shiftKey",
    ] as const)
      expect(shouldTrashSelection({ ...key, [flag]: true }, 1, false, false)).toBe(false);
    expect(shouldTrashSelection({ ...key, key: "Enter" }, 1, false, false)).toBe(false);
  });
});
