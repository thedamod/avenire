"use client";

import { useMemo, useState } from "react";
import type { FileId, LibraryFile } from "@avenire/contracts";
import { Plus, X } from "lucide-react";
import { ScrollFade } from "@avenire/ui/components/scroll-fade";
import { Checkbox } from "@avenire/ui/components/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@avenire/ui/components/popover";
import { cn } from "@avenire/ui/lib/utils";
import { FileKindIcon } from "~/components/app";

/** "+ Add context": pin specific notes or sources to the question. */
export function AddContextButton({
  files,
  selected,
  onChange,
  compact = false,
}: {
  files: readonly LibraryFile[];
  selected: readonly FileId[];
  onChange: (ids: FileId[]) => void;
  /** Phone: icon only. */
  compact?: boolean;
}) {
  const [filter, setFilter] = useState("");
  const matches = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return (
      needle ? files.filter((file) => file.title.toLowerCase().includes(needle)) : files
    ).slice(0, 60);
  }, [files, filter]);
  const chosen = new Set(selected);

  return (
    <Popover onOpenChange={(open) => !open && setFilter("")}>
      <PopoverTrigger
        aria-label="Add context"
        className={cn(
          "inline-flex shrink-0 items-center gap-2 rounded-lg text-[13px] text-foreground-soft transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
          compact ? "size-11 justify-center rounded-full" : "h-8",
        )}
      >
        <Plus
          className={compact ? "size-[18px]" : "size-3.5"}
          strokeWidth={1.6}
          aria-hidden="true"
        />
        {compact ? null : "Add context"}
      </PopoverTrigger>
      <PopoverContent align="start" data-mobile-sheet="true" className="w-80 p-0">
        <input
          autoFocus
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Find a note or source"
          className="h-10 w-full border-b border-border bg-transparent px-3 text-[13.5px] outline-none placeholder:text-muted-foreground"
        />
        <ScrollFade as="ul" className="max-h-72 overflow-y-auto p-1">
          {matches.map((file) => (
            <li key={file.id}>
              <label className="flex h-11 cursor-pointer items-center gap-2.5 rounded-md px-2 text-[13px] hover:bg-hover md:h-8">
                <Checkbox
                  checked={chosen.has(file.id)}
                  onCheckedChange={(checked) =>
                    onChange(
                      checked ? [...selected, file.id] : selected.filter((id) => id !== file.id),
                    )
                  }
                />
                <FileKindIcon kind={file.kind} url={file.sourceUrl} size={14} />
                <span className="truncate">{file.title}</span>
              </label>
            </li>
          ))}
          {matches.length === 0 ? (
            <li className="px-2 py-3 text-[13px] text-muted-foreground">Nothing matches.</li>
          ) : null}
        </ScrollFade>
      </PopoverContent>
    </Popover>
  );
}

export function ContextChips({
  files,
  onRemove,
}: {
  files: readonly LibraryFile[];
  onRemove: (id: FileId) => void;
}) {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {files.map((file) => (
        <span
          key={file.id}
          className="inline-flex h-[26px] max-w-60 items-center gap-1.5 rounded-full border border-input pr-1 pl-2.5 text-xs text-foreground-soft"
        >
          <FileKindIcon kind={file.kind} url={file.sourceUrl} size={12} />
          <span className="truncate">{file.title}</span>
          <button
            type="button"
            aria-label={`Remove ${file.title}`}
            onClick={() => onRemove(file.id)}
            className="inline-flex size-5 items-center justify-center rounded-full hover:bg-hover hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
