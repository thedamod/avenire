"use client";

import { useMemo, useState } from "react";
import type { FileId, Folder } from "@avenire/contracts";
import { ResponsiveDialog } from "~/components/app";
import { useLibrary } from "~/features/library/LibraryProvider";
import { NewNotebookDialog } from "~/features/library/NewNotebookDialog";
import { NotebookPicker } from "~/features/library/NotebookPicker";
import { useFolderSuggestions } from "~/features/library/useFolderSuggestions";

const NO_FILES: readonly FileId[] = [];

/**
 * "Move to" for one open note or source: the notebook list, or a new notebook. With `fileId`,
 * the notebooks it most likely belongs in are suggested first.
 */
export function MoveToNotebook({
  open,
  onOpenChange,
  title,
  fileId,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  fileId?: FileId | undefined;
  onPick: (folder: Folder) => void;
}) {
  const { folders, folderById } = useLibrary();
  const ids = useMemo(() => (open && fileId ? [fileId] : NO_FILES), [open, fileId]);
  const suggested = useFolderSuggestions(ids, folderById).get(fileId!)?.suggested ?? [];
  const [creating, setCreating] = useState(false);
  return (
    <>
      <ResponsiveDialog
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        hideTitle
        className="max-w-[340px] p-1 sm:max-w-[340px]"
      >
        <NotebookPicker
          title={title}
          folders={folders ?? []}
          suggested={suggested}
          className="pb-[max(12px,env(safe-area-inset-bottom))] md:pb-1"
          onPick={(folder) => {
            onOpenChange(false);
            onPick(folder);
          }}
          onNew={() => {
            onOpenChange(false);
            setCreating(true);
          }}
        />
      </ResponsiveDialog>
      <NewNotebookDialog open={creating} onOpenChange={setCreating} onCreated={onPick} />
    </>
  );
}
