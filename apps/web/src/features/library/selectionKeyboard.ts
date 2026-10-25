type DeleteKeyEvent = Pick<
  KeyboardEvent,
  | "key"
  | "defaultPrevented"
  | "isComposing"
  | "repeat"
  | "altKey"
  | "ctrlKey"
  | "metaKey"
  | "shiftKey"
>;
/** Shared pure guard; Cmd+Backspace is accepted, browser/editor shortcuts stay untouched. */
export function shouldTrashSelection(
  event: DeleteKeyEvent,
  selectionSize: number,
  editing: boolean,
  overlayOpen: boolean,
): boolean {
  return (
    selectionSize > 0 &&
    !editing &&
    !overlayOpen &&
    !event.defaultPrevented &&
    !event.isComposing &&
    !event.repeat &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    (event.key === "Delete" || event.key === "Backspace")
  );
}
