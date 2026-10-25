"use client";

import { useEffect, useRef, useState } from "react";
import type { Folder } from "@avenire/contracts";
import { Skeleton } from "@avenire/ui/components/skeleton";
import { NotebookCover, plural } from "~/components/app";
import { relativeLabel } from "~/lib/time";
import { useNow } from "~/lib/useNow";

/**
 * Cover + title + "9 notes · 22 sources · edited 2h ago" (07 / M09). The cover opens the cover
 * dialog; the title renames in place.
 */
export function NotebookTitle({
  folder,
  noteCount,
  sourceCount,
  renaming,
  onRenamingChange,
  onRename,
  onChangeCover,
}: {
  folder: Folder | undefined;
  noteCount: number | undefined;
  sourceCount: number | undefined;
  renaming: boolean;
  onRenamingChange: (renaming: boolean) => void;
  onRename: (name: string) => void;
  onChangeCover: () => void;
}) {
  const now = useNow();
  if (!folder)
    return (
      <div className="flex items-end gap-4 md:gap-5">
        <Skeleton className="h-[84px] w-16 rounded-[3px_8px_8px_3px] md:h-[102px] md:w-[78px]" />
        <div className="flex flex-col gap-2 pb-1">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-3.5 w-40" />
        </div>
      </div>
    );

  const notes = noteCount ?? folder.noteCount;
  const sources = sourceCount ?? folder.sourceCount;
  const meta = [
    plural(notes, "note"),
    plural(sources, "source"),
    `edited ${relativeLabel(folder.updatedAt, "precise", new Date(now)).toLowerCase()}`,
  ].join(" · ");

  return (
    <div className="flex items-end gap-4 md:gap-5">
      <button
        type="button"
        onClick={onChangeCover}
        aria-label="Change cover"
        title="Change cover"
        className="shrink-0 rounded-[3px_8px_8px_3px] outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.98]"
      >
        {/* Only the colour and drawing: the title sits beside it. */}
        <NotebookCover
          folder={{ ...folder, name: "" }}
          showCounts={false}
          className="text-[4.85px] md:text-[5.9px]"
        />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1 pb-0.5 md:gap-1.5 md:pb-1">
        {renaming ? (
          <RenameField
            initial={folder.name}
            onDone={(name) => {
              onRenamingChange(false);
              if (name && name !== folder.name) onRename(name);
            }}
          />
        ) : (
          <h1 className="min-w-0">
            <button
              type="button"
              onClick={() => onRenamingChange(true)}
              title="Rename"
              className="max-w-full truncate text-left text-[26px] leading-8 font-semibold tracking-[-0.02em] outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:text-[30px] md:leading-9"
            >
              {folder.name}
            </button>
          </h1>
        )}
        <p className="text-[13px] leading-[18px] text-muted-foreground md:text-foreground-soft">
          {meta}
        </p>
      </div>
    </div>
  );
}

function RenameField({ initial, onDone }: { initial: string; onDone: (name: string) => void }) {
  const [value, setValue] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  function finish(name: string) {
    if (done.current) return;
    done.current = true;
    onDone(name.trim());
  }

  return (
    <input
      ref={input}
      value={value}
      maxLength={120}
      aria-label="Notebook name"
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => finish(value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          finish(value);
        } else if (event.key === "Escape") {
          event.preventDefault();
          finish(initial);
        }
      }}
      className="-mx-1 w-full min-w-0 rounded-md bg-transparent px-1 text-[26px] max-md:text-[26px]! leading-8 font-semibold tracking-[-0.02em] outline-none ring-1 ring-input focus:ring-ring/60 md:text-[30px] md:leading-9"
    />
  );
}
