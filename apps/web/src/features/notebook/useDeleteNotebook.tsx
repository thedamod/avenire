"use client";

import { useRef, useState } from "react";
import type { FileId, Folder } from "@avenire/contracts";
import { call } from "@avenire/client-runtime/rpc";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@avenire/ui/components/alert-dialog";
import { buttonVariants } from "@avenire/ui/components/button";
import { useLibrary } from "~/features/library/LibraryProvider";
import { errorMessage, useApi } from "~/lib/rpc";
import { notebookDeleteCopy, notebookTrashFiles } from "./notebookDeletion";

/** Fetch current memberships before showing exact sweep counts. Never guess while loading. */
export function useDeleteNotebook(folder: Folder | undefined, onDeleted?: () => void) {
  const api = useApi();
  const { actions } = useLibrary();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [preview, setPreview] = useState<{
    folder: Folder;
    ids: FileId[];
    notes: number;
    sources: number;
  }>();
  async function requestDelete() {
    if (!folder || busy.current) return;
    busy.current = true;
    setPreview(undefined);
    setOpen(true);
    try {
      const [files, folders] = await Promise.all([
        call(api, (client) => client["library.listFiles"]({ folderId: folder.id })),
        call(api, (client) => client["library.listFolders"]()),
      ]);
      const swept = notebookTrashFiles(
        files,
        folder.id,
        new Set(folders.filter((item) => item.archivedAt === null).map((item) => item.id)),
      );
      setPreview({
        folder,
        ids: swept.map((file) => file.id),
        notes: swept.filter((file) => file.kind === "note").length,
        sources: swept.filter((file) => file.kind !== "note").length,
      });
    } catch (cause) {
      setOpen(false);
      toast.error(`Couldn't check notebook contents: ${errorMessage(cause)}`);
    } finally {
      busy.current = false;
    }
  }
  const dialog = (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) setOpen(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {preview?.folder.name ?? folder?.name ?? "notebook"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {preview
              ? notebookDeleteCopy(preview.notes, preview.sources)
              : "Checking which notes and sources will move to Trash…"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: "destructive" })}
            disabled={!preview || pending}
            onClick={(event) => {
              event.preventDefault();
              if (!preview || pending) return;
              setPending(true);
              void actions
                .trashNotebook(preview.folder, preview.ids)
                .then((deleted) => {
                  if (deleted) {
                    setOpen(false);
                    onDeleted?.();
                  }
                })
                .finally(() => setPending(false));
            }}
          >
            {pending ? "Moving to Trash…" : "Delete notebook"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { requestDelete, dialog };
}
