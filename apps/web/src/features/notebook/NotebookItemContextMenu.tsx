"use client";

import { useState, type ReactElement } from "react";
import type { Folder, FolderColor, FolderCover } from "@avenire/contracts";
import { call, invalidateLibrary } from "@avenire/client-runtime/rpc";
import { toast } from "sonner";
import { Button } from "@avenire/ui/components/button";
import { Input } from "@avenire/ui/components/input";
import { ItemContextMenu } from "~/components/app/ItemContextMenu";
import { ResponsiveDialog } from "~/components/app/ResponsiveDialog";
import { useLibrary } from "~/features/library/LibraryProvider";
import { errorMessage, useApi } from "~/lib/rpc";
import { CoverDialog } from "./CoverDialog";
import { buildNotebookActions } from "./notebookActions";
import { useDeleteNotebook } from "./useDeleteNotebook";

export function NotebookItemContextMenu({
  folder,
  children,
}: {
  folder: Folder;
  children: ReactElement;
}) {
  const api = useApi();
  const { actions } = useLibrary();
  const [renaming, setRenaming] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [name, setName] = useState(folder.name);
  const [saving, setSaving] = useState(false);
  const deletion = useDeleteNotebook(folder);
  const href = `/notebooks/${folder.id}`;
  async function update(patch: { name?: string; color?: FolderColor; cover?: FolderCover }) {
    setSaving(true);
    try {
      await call(api, (client) =>
        client["library.updateFolder"]({ folderId: folder.id, ...patch }),
      );
      invalidateLibrary(api, ["folders"]);
      setRenaming(false);
    } catch (cause) {
      toast.error(`Couldn't update the notebook: ${errorMessage(cause)}`);
    } finally {
      setSaving(false);
    }
  }
  const menu = buildNotebookActions(href, {
    "new-tab": () => {
      window.open(href, "_blank", "noopener,noreferrer");
    },
    "new-note": () => {
      void actions.createNote([folder.id]);
    },
    ask: () => {
      void actions.askRuth(`Help me understand the material in ${folder.name}`, {
        folderId: folder.id,
      });
    },
    rename: () => {
      setName(folder.name);
      setRenaming(true);
    },
    cover: () => setCoverOpen(true),
    copy: () => {
      void navigator.clipboard
        .writeText(new URL(href, window.location.origin).href)
        .then(() => toast("Link copied"))
        .catch((cause: unknown) => toast.error(`Couldn't copy link: ${errorMessage(cause)}`));
    },
    delete: () => {
      void deletion.requestDelete();
    },
  });
  return (
    <>
      <ItemContextMenu actions={menu}>{children}</ItemContextMenu>
      <ResponsiveDialog
        open={renaming}
        onOpenChange={(open) => {
          if (!saving) setRenaming(open);
        }}
        title="Rename notebook"
      >
        <form
          className="flex flex-col gap-4 p-5 md:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() && !saving) void update({ name: name.trim() });
          }}
        >
          <Input
            autoFocus
            aria-label="Notebook name"
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onFocus={(event) => event.target.select()}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => setRenaming(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </ResponsiveDialog>
      <CoverDialog
        folder={folder}
        open={coverOpen}
        onOpenChange={setCoverOpen}
        onSave={(patch) => {
          void update(patch);
        }}
      />
      {deletion.dialog}
    </>
  );
}
