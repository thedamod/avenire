import {
  ExternalLink,
  FilePlus,
  Link2,
  MessageCircle,
  Palette,
  Pencil,
  SquareArrowOutUpRight,
  Trash2,
} from "lucide-react";
import type { ContextAction } from "~/components/app/ItemContextMenu";

export type NotebookActionId =
  | "open"
  | "new-tab"
  | "new-note"
  | "ask"
  | "rename"
  | "cover"
  | "copy"
  | "delete";
export function buildNotebookActions(
  href: string,
  handlers: Record<Exclude<NotebookActionId, "open">, () => void>,
): readonly (ContextAction & { id: NotebookActionId })[] {
  return [
    { id: "open", label: "Open", icon: SquareArrowOutUpRight, href, group: "open" },
    {
      id: "new-tab",
      label: "Open in new tab",
      icon: ExternalLink,
      onSelect: handlers["new-tab"],
      group: "open",
    },
    {
      id: "new-note",
      label: "New note in this notebook",
      icon: FilePlus,
      onSelect: handlers["new-note"],
      group: "create",
    },
    {
      id: "ask",
      label: "Ask Ava about this notebook",
      icon: MessageCircle,
      onSelect: handlers.ask,
      group: "create",
    },
    { id: "rename", label: "Rename", icon: Pencil, onSelect: handlers.rename, group: "edit" },
    { id: "cover", label: "Change cover", icon: Palette, onSelect: handlers.cover, group: "edit" },
    { id: "copy", label: "Copy link", icon: Link2, onSelect: handlers.copy, group: "share" },
    {
      id: "delete",
      label: "Delete notebook",
      icon: Trash2,
      destructive: true,
      onSelect: handlers.delete,
      group: "delete",
    },
  ];
}
