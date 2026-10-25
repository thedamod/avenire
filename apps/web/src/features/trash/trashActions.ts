import { RotateCcw, Trash2 } from "lucide-react";
import type { ContextAction } from "~/components/app/ItemContextMenu";

/** Shared policy for context menus, touch actions and the selection toolbar. */
export function buildTrashActions(
  count: number,
  handlers: { restore(): void; purge(): void },
  busy = false,
): readonly ContextAction[] {
  if (!count) return [];
  return [
    {
      label: count === 1 ? "Restore" : `Restore ${count} items`,
      icon: RotateCcw,
      onSelect: handlers.restore,
      disabled: busy,
      group: "restore",
    },
    {
      label: count === 1 ? "Delete permanently" : `Delete ${count} items permanently`,
      icon: Trash2,
      onSelect: handlers.purge,
      disabled: busy,
      destructive: true,
      group: "delete",
    },
  ];
}
