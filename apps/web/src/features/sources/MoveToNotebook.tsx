"use client";

import { useState } from "react";
import type { Folder } from "@avenire/contracts";
import { ResponsiveDialog } from "~/components/app";
import { useLibrary } from "~/features/library/LibraryProvider";
import { NewNotebookDialog } from "~/features/library/NewNotebookDialog";
import { NotebookPicker } from "~/features/library/NotebookPicker";

/** "Move to" for one open note or source: the notebook list, or a new notebook. */
export function MoveToNotebook({
  open,
  onOpenChange,
  title,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onPick: (folder: Folder) => void;
}) {
  const { folders } = useLibrary();
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
