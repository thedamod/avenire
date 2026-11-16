import type { FileId, Folder, FolderId, LibraryFile } from "@avenire/contracts";
import {
  ArrowUpRight,
  Check,
  CheckSquare,
  Download,
  ExternalLink,
  FolderInput,
  FolderMinus,
  Link,
  Moon,
  Pencil,
  Plus,
  Square,
  Trash2,
} from "lucide-react";
import type { ContextAction } from "~/components/app/ItemContextMenu";

export type ActionFile = Pick<LibraryFile, "id" | "kind" | "title" | "folderIds"> &
  Partial<Pick<LibraryFile, "origin" | "sourceUrl">>;
export interface FileActionHandlers {
  move(folder: Folder): void;
  newNotebook(): void;
  ask(): void;
  download(): void;
  trash(): void;
  openInNewTab(): void;
  openOriginal(): void;
  copyLink(): void;
  toggleSelection(): void;
  rename(): void;
  removeFromNotebook(): void;
}
export interface FileActionsInput {
  readonly files: readonly ActionFile[];
  readonly folders: readonly Folder[];
  readonly handlers: FileActionHandlers;
  readonly href?: string | undefined;
  readonly selected?: boolean | undefined;
  readonly desktop?: boolean | undefined;
  readonly currentFolderId?: FolderId | undefined;
  /** The single target is a source with somewhere to reopen it (`hasOriginal`). */
  readonly original?: boolean | undefined;
  /** Dock has a count even before file data is available. */
  readonly ids?: readonly FileId[] | undefined;
}
export interface FileAction extends ContextAction {
  readonly id:
    | "open"
    | "new-tab"
    | "original"
    | "ask"
    | "move"
    | "remove"
    | "download"
    | "select"
    | "rename"
    | "copy"
    | "trash";
}

/** Pure shared policy for row menus and the selection dock. All mutations live in handlers. */
export function buildFileActions({
  files,
  folders,
  handlers: h,
  href,
  selected,
  desktop = true,
  currentFolderId,
  original,
  ids,
}: FileActionsInput): readonly FileAction[] {
  const count = ids?.length ?? files.length;
  if (!count) return [];
  const single = count === 1;
  const allNotes = files.length === count && files.every((file) => file.kind === "note");
  const allSources = files.length === count && files.every((file) => file.kind !== "note");
  const noun = allNotes ? "note" : allSources ? "source" : "item";
  const target = `${count} ${noun}${single ? "" : "s"}`;
  const actions: FileAction[] = [];
  if (single && href) {
    actions.push({ id: "open", label: "Open", icon: ArrowUpRight, href, group: "open" });
    if (desktop)
      actions.push({
        id: "new-tab",
        label: "Open in new tab",
        icon: ArrowUpRight,
        onSelect: h.openInNewTab,
        group: "open",
      });
  }
  if (single && original && allSources)
    actions.push({
      id: "original",
      label: "Open original",
      icon: ExternalLink,
      onSelect: h.openOriginal,
      group: "open",
    });
  actions.push({
    id: "ask",
    label: `Ask Ava about ${single ? "it" : "them"}`,
    icon: Moon,
    onSelect: h.ask,
    group: "organize",
  });
  actions.push({
    id: "move",
    label: single ? "Move to notebook" : `Move ${target} to`,
    icon: FolderInput,
    group: "organize",
    children: [
      ...folders.map((folder): ContextAction => {
        const current =
          files.length === count && files.every((file) => file.folderIds.includes(folder.id));
        return {
          label: folder.name,
          icon: current ? Check : FolderInput,
          disabled: current,
          onSelect: () => h.move(folder),
          group: "notebooks",
        };
      }),
      { label: "New notebook…", icon: Plus, onSelect: h.newNotebook, group: "new" },
    ],
  });
  if (currentFolderId && files.some((file) => file.folderIds.includes(currentFolderId)))
    actions.push({
      id: "remove",
      label: single ? "Remove from notebook" : `Remove ${target} from notebook`,
      icon: FolderMinus,
      onSelect: h.removeFromNotebook,
      group: "organize",
    });
  if (single)
    actions.push({
      id: "rename",
      label: "Rename…",
      icon: Pencil,
      onSelect: h.rename,
      group: "organize",
    });
  actions.push({
    id: "download",
    label: single ? "Download" : `Download ${target}`,
    icon: Download,
    onSelect: h.download,
    group: "share",
  });
  if (href && single)
    actions.push({
      id: "copy",
      label: "Copy link",
      icon: Link,
      onSelect: h.copyLink,
      group: "share",
    });
  if (selected !== undefined)
    actions.push({
      id: "select",
      label: selected ? "Deselect" : "Select",
      icon: selected ? CheckSquare : Square,
      onSelect: h.toggleSelection,
      group: "selection",
    });
  actions.push({
    id: "trash",
    label: single ? "Move to Trash" : `Move ${target} to Trash`,
    icon: Trash2,
    destructive: true,
    onSelect: h.trash,
    group: "trash",
  });
  return actions;
}
