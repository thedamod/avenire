"use client";

import type { Folder, FolderId } from "@avenire/contracts";
import { Popover, PopoverContent, PopoverTrigger } from "@avenire/ui/components/popover";
import { call, invalidate } from "@avenire/client-runtime/rpc";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage, useApi } from "~/lib/rpc";
import { NotebookPicker } from "~/features/library/NotebookPicker";
import { useLibraryIndex } from "~/features/chat/useLibraryIndex";

/**
 * "Save to notebook": pick a notebook (Ruth's guess first) and save the answer as a note with
 * `source: "chat"`. The markdown is built by the caller (answer + citations).
 */
export function SaveToNotebook({
  title,
  markdown,
  guess,
  className,
  onSaved,
  standalone = false,
}: {
  readonly title: string;
  readonly markdown: () => string;
  readonly guess: FolderId | null;
  readonly className?: string;
  readonly onSaved?: () => void;
  readonly standalone?: boolean;
}) {
  const api = useApi();
  const library = useLibraryIndex();
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const folders = guess
    ? [
        ...library.folders.filter((folder) => folder.id === guess),
        ...library.folders.filter((folder) => folder.id !== guess),
      ]
    : library.folders;

  const save = async (folder: Folder) => {
    setBusy(true);
    try {
      const file = await call(api, (client) =>
        client["library.createNote"]({
          title: title.replace(/\s+/g, " ").trim().slice(0, 200) || "Ruth's answer",
          markdown: markdown(),
          folderIds: [folder.id],
          source: "chat",
        }),
      );
      invalidate(api, ["files", "folders", "notes"]);
      setOpen(false);
      onSaved?.();
      toast.success(`Saved to ${folder.name}`, {
        action: {
          label: "Open",
          onClick: () => {
            const path = `/notes/${file.id}`;
            if (standalone && window.avenire?.openInMain) void window.avenire.openInMain(path);
            else window.location.assign(path);
          },
        },
      });
    } catch (cause) {
      toast.error(`Couldn't save: ${errorMessage(cause)}`);
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    const clean = name.trim();
    if (!clean) return;
    setBusy(true);
    try {
      const folder = await call(api, (client) => client["library.createFolder"]({ name: clean }));
      await save(folder);
    } catch (cause) {
      toast.error(`Couldn't create the notebook: ${errorMessage(cause)}`);
      setBusy(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setNaming(false);
      }}
    >
      <PopoverTrigger className={className} disabled={busy}>
        Save to notebook
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-64 p-1">
        {naming ? (
          <form
            className="flex flex-col gap-1.5 p-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Notebook name"
              maxLength={120}
              className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-[13px] outline-none focus:border-ring/60"
            />
            <button
              type="submit"
              disabled={!name.trim() || busy}
              className="h-8 rounded-lg bg-primary text-[13px] font-medium text-primary-foreground disabled:opacity-40"
            >
              Create and save
            </button>
          </form>
        ) : (
          <NotebookPicker
            title={guess ? "Save to notebook · Ruth's guess first" : "Save to notebook"}
            folders={folders}
            onPick={(folder) => void save(folder)}
            onNew={() => setNaming(true)}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
