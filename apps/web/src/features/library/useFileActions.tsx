"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import type { FileId, FolderId } from "@avenire/contracts";
import { Button } from "@avenire/ui/components/button";
import { Input } from "@avenire/ui/components/input";
import { toast } from "sonner";
import { ResponsiveDialog } from "~/components/app/ResponsiveDialog";
import { useIsMobile } from "~/lib/responsive";
import { errorMessage } from "~/lib/rpc";
import { MoveToNotebook } from "~/features/sources/MoveToNotebook";
import { NewNotebookDialog } from "./NewNotebookDialog";
import { useLibrary } from "./LibraryProvider";
import { hasOriginal } from "~/features/sources/reopen";
import { useIsDesktop, useReopenFile } from "~/features/sources/useReopenFile";
import { buildFileActions, type ActionFile } from "./fileActions";

/** The dock and row menus share policy, callbacks and existing filing dialogs. */
export function useFileActions({
  ids,
  fallback,
  href,
  selected,
  onToggle,
  onComplete,
}: {
  ids: readonly FileId[];
  fallback?: ActionFile | undefined;
  href?: string | undefined;
  selected?: boolean | undefined;
  onToggle?: (() => void) | undefined;
  onComplete?: (() => void) | undefined;
}) {
  const { files, folders, actions } = useLibrary();
  const params = useParams<{ folderId?: string }>();
  const currentFolderId = params?.folderId as FolderId | undefined;
  const isMobile = useIsMobile();
  const desktopShell = useIsDesktop();
  const reopen = useReopenFile();
  const [moving, setMoving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const targets = ids.flatMap((id) => {
    const file = fallback?.id === id ? fallback : files?.find((item) => item.id === id);
    return file ? [file] : [];
  });
  // A dialog survives menu dismissal: freeze its targets even if selection changes afterwards.
  const [dialogIds, setDialogIds] = useState<readonly FileId[]>([]);
  const complete = (operation: Promise<void>) => {
    void operation.then(onComplete);
  };
  const single = targets.length === 1 && ids.length === 1 ? targets[0] : undefined;
  const original =
    single && single.kind !== "note"
      ? { id: single.id, origin: single.origin ?? null, sourceUrl: single.sourceUrl ?? null }
      : undefined;
  const list = buildFileActions({
    files: targets,
    ids,
    folders: folders ?? [],
    href,
    selected,
    desktop: !isMobile,
    currentFolderId,
    original: !!original && hasOriginal(original, desktopShell),
    handlers: {
      move: (folder) => complete(actions.moveFiles(ids, folder)),
      newNotebook: () => {
        setDialogIds([...ids]);
        setCreating(true);
      },
      ask: () => {
        void actions.askRuth(
          `Help me understand ${ids.length === 1 ? "this" : "these"}: ${targets.map((file) => file.title).join("; ")}`,
          { fileIds: ids },
        );
      },
      download: () => {
        void actions.downloadFiles(ids);
      },
      trash: () => complete(actions.trashFiles(ids)),
      openInNewTab: () => {
        if (href) window.open(href, "_blank", "noopener,noreferrer");
      },
      openOriginal: () => {
        if (original) reopen(original);
      },
      copyLink: () => {
        if (href)
          void navigator.clipboard
            .writeText(new URL(href, window.location.origin).href)
            .then(() => toast("Link copied"))
            .catch((cause: unknown) => toast.error(`Couldn't copy link: ${errorMessage(cause)}`));
      },
      toggleSelection: () => onToggle?.(),
      rename: () => {
        setDialogIds([...ids]);
        setTitle(targets[0]?.title ?? "");
        setRenaming(true);
      },
      removeFromNotebook: () => {
        if (currentFolderId) complete(actions.removeFilesFromNotebook(ids, currentFolderId));
      },
    },
  });
  const moveLabel = list.find((action) => action.id === "move")?.label ?? "Move to notebook";
  const dialogs = dialogIds.length ? (
    <>
      <MoveToNotebook
        open={moving}
        onOpenChange={setMoving}
        title={moveLabel}
        onPick={(folder) => complete(actions.moveFiles(dialogIds, folder))}
      />
      <NewNotebookDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(folder) => complete(actions.moveFiles(dialogIds, folder))}
      />
      <ResponsiveDialog
        open={renaming}
        onOpenChange={setRenaming}
        title={targets[0]?.kind === "note" ? "Rename note" : "Rename source"}
      >
        <form
          className="flex flex-col gap-4 p-5 md:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            const id = dialogIds[0];
            if (!id || !title.trim() || saving) return;
            setSaving(true);
            void actions
              .renameFile(id, title.trim())
              .then(() => setRenaming(false))
              .catch(() => {
                // LibraryProvider already toasts the error; keep the title editable.
              })
              .finally(() => setSaving(false));
          }}
        >
          <Input
            aria-label="Title"
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Button type="submit" disabled={saving || !title.trim()}>
            Save
          </Button>
        </form>
      </ResponsiveDialog>
    </>
  ) : null;
  return {
    actions: list,
    dialogs,
    moving,
    openMove: () => {
      setDialogIds([...ids]);
      setMoving(true);
    },
  };
}
