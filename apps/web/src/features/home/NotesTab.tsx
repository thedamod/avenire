"use client";

import type { Folder, FolderId, LibraryFile } from "@avenire/contracts";
import { Plus } from "lucide-react";
import { Button } from "@avenire/ui/components/button";
import { useArrivedLate } from "@avenire/ui/components/presence";
import { cn } from "@avenire/ui/lib/utils";
import { NotebookTag, RelativeTime } from "~/components/app";
import { FileRow } from "~/features/library/FileRow";
import { PresenceRows } from "~/features/library/PresenceRows";
import type { Selection } from "~/features/library/useSelection";
import { ListSkeleton } from "./states";

export function notePreview(note: LibraryFile): string {
  const by =
    note.source === "ruth" || note.source === "ruth-cloud"
      ? "Written by Ava"
      : note.source === "chat"
        ? "Saved from Ava"
        : null;
  return [by, note.preview?.trim() || null].filter(Boolean).join(" · ") || "Empty note";
}

/** Notes across notebooks, last edited first (04 / M03). */
export function NotesTab({
  notes,
  folderById,
  selection,
  onNewNote,
}: {
  notes: readonly LibraryFile[] | undefined;
  folderById: ReadonlyMap<FolderId, Folder>;
  selection: Selection;
  onNewNote: () => void;
}) {
  const toggle = selection.toggle;
  const late = useArrivedLate(notes);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] text-muted-foreground">Sorted by last edited</span>
        <Button
          variant="outline"
          size="sm"
          onClick={onNewNote}
          className="max-md:h-9 max-md:text-[13px]"
        >
          <Plus />
          New note
        </Button>
      </div>
      {notes === undefined ? (
        <ListSkeleton rows={4} />
      ) : notes.length === 0 ? (
        <EmptyLine>No notes yet. Write one, or save an answer from Ava.</EmptyLine>
      ) : (
        <div
          className={cn(
            late && "enter-fade",
            "-mx-4 divide-y divide-border md:mx-0 md:overflow-hidden md:rounded-[10px] md:border md:border-border md:bg-card",
          )}
        >
          <PresenceRows items={notes}>
            {(note) => {
              const folder = note.folderIds[0] ? folderById.get(note.folderIds[0]) : undefined;
              return (
                <FileRow
                  selection={selection}
                  key={note.id}
                  file={note}
                  subtitle={notePreview(note)}
                  aside={folder ? <NotebookTag name={folder.name} color={folder.color} /> : null}
                  trailing={<RelativeTime iso={note.updatedAt} className="md:w-16 md:text-right" />}
                  selected={selection.has(note.id)}
                  selecting={selection.size > 0}
                  onToggle={toggle}
                />
              );
            }}
          </PresenceRows>
        </div>
      )}
    </section>
  );
}

export function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-input px-5 py-8 text-center text-[13px] text-muted-foreground">
      {children}
    </div>
  );
}
