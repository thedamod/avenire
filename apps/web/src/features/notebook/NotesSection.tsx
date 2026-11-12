"use client";

import Link from "next/link";
import { memo } from "react";
import type { LibraryFile } from "@avenire/contracts";
import { Plus } from "lucide-react";
import { Button } from "@avenire/ui/components/button";
import { useArrivedLate } from "@avenire/ui/components/presence";
import { Skeleton } from "@avenire/ui/components/skeleton";
import { cn } from "@avenire/ui/lib/utils";
import { RelativeTime } from "~/components/app";
import { noteProvenance, writtenByRuth } from "~/features/notes/provenance";
import { FileItemContextMenu } from "~/features/library/FileItemContextMenu";
import { useLongPress, type Selection } from "~/features/library/useSelection";
import { EmptyLine, SectionHeading } from "./parts";

/** "Notes 9 · + New note" and the note tiles: two columns on desktop, a divider list on phone. */
export function NotesSection({
  notes,
  selection,
  onNewNote,
}: {
  notes: readonly LibraryFile[] | undefined;
  selection: Selection;
  onNewNote: () => void;
}) {
  const late = useArrivedLate(notes);
  return (
    <section aria-labelledby="notebook-notes" className="flex flex-col gap-3 md:gap-4">
      <SectionHeading id="notebook-notes" label="Notes" count={notes?.length}>
        <Button variant="secondary" onClick={onNewNote} className="md:h-7 md:px-2.5">
          <Plus />
          New note
        </Button>
      </SectionHeading>
      {notes === undefined ? (
        <NotesSkeleton />
      ) : notes.length === 0 ? (
        <EmptyLine>No notes yet. Write one, or ask Ava to draft one from these sources.</EmptyLine>
      ) : (
        <ul
          className={cn(
            late && "enter-fade",
            "-mx-4 flex flex-col md:mx-0 md:grid md:grid-cols-2 md:gap-3",
          )}
        >
          {notes.map((note, index) => (
            <li
              key={note.id}
              className={cn(
                index > 0 &&
                  "max-md:before:ml-5 max-md:before:block max-md:before:h-px max-md:before:bg-border",
              )}
            >
              <NoteTile selection={selection} note={note} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The stored preview is markdown-ish; drop escapes and math dollars for the tile. */
function plainPreview(preview: string | null): string {
  return (preview ?? "")
    .replace(/\\([\\`*_{}[\]()#+\-.!$])/g, "$1")
    .replace(/\$+([^$]+)\$+/g, "$1")
    .trim();
}

export const NoteTile = memo(function NoteTile({
  note,
  selection,
}: {
  note: LibraryFile;
  selection: Selection;
}) {
  const ruth = writtenByRuth(note);
  const { handlers, consumeClick } = useLongPress(() => selection.toggle(note.id));
  return (
    <FileItemContextMenu file={note} href={`/notes/${note.id}`} selection={selection}>
      <Link
        {...handlers}
        data-selected={selection.has(note.id) || undefined}
        onClick={(event) => {
          if (consumeClick()) event.preventDefault();
          else if (selection.size) {
            event.preventDefault();
            selection.toggle(note.id);
          }
        }}
        href={`/notes/${note.id}`}
        className="data-[selected]:bg-surface-3 flex h-full flex-col gap-1 px-5 py-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 active:bg-hover md:min-h-[112px] md:rounded-[10px] md:border md:border-border md:bg-card md:px-4 md:py-[15px] md:hover:border-input md:hover:bg-surface-3"
      >
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[16px] leading-[21px] font-semibold md:text-[13.5px] md:leading-5">
            {note.title || "Untitled"}
          </span>
          <RelativeTime iso={note.updatedAt} className="text-xs md:text-xs" />
        </span>
        <span className="line-clamp-2 text-[14px] leading-5 text-foreground-soft md:text-[13.5px]">
          {plainPreview(note.preview) || <span className="text-muted-foreground">Empty note</span>}
        </span>
        <span
          className={cn(
            "text-xs leading-4 md:mt-auto md:pt-1.5",
            ruth ? "text-ruth-text" : "text-muted-foreground",
          )}
        >
          {noteProvenance(note)}
        </span>
      </Link>
    </FileItemContextMenu>
  );
});

function NotesSkeleton() {
  return (
    <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:gap-3">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="flex h-[92px] flex-col gap-2 md:h-[112px] md:rounded-[10px] md:border md:border-border md:p-4"
        >
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="mt-auto h-3 w-24" />
        </div>
      ))}
    </div>
  );
}
