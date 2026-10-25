"use client";

import type { Folder } from "@avenire/contracts";
import { Plus } from "lucide-react";
import { NotebookSwatch } from "~/components/app";
import { ScrollFade } from "@avenire/ui/components/scroll-fade";
import { cn } from "@avenire/ui/lib/utils";

/**
 * Plain list of notebooks with "New notebook…" at the end (18b popover / M28 sheet).
 */
export function NotebookPicker({
  title,
  folders,
  onPick,
  onNew,
  className,
}: {
  title: string;
  folders: readonly Folder[];
  onPick: (folder: Folder) => void;
  onNew: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      <p className="px-5 pt-1 pb-3 text-lg font-semibold md:px-3 md:pt-2 md:pb-1.5 md:text-xs md:font-normal md:text-muted-foreground">
        {title}
      </p>
      <ScrollFade as="ul" className="max-h-[50dvh] overflow-y-auto md:max-h-72 md:px-1">
        {folders.map((folder) => (
          <li key={folder.id}>
            <button
              type="button"
              onClick={() => onPick(folder)}
              className="flex h-[52px] w-full items-center gap-3 px-5 text-left text-[15px] transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-none active:bg-active md:h-[34px] md:gap-2.5 md:rounded-md md:px-2 md:text-[13px]"
            >
              <NotebookSwatch color={folder.color} className="md:h-2.5" />
              <span className="truncate">{folder.name}</span>
            </button>
          </li>
        ))}
        {folders.length === 0 ? (
          <li className="px-5 py-3 text-[13px] text-muted-foreground md:px-2">No notebooks yet.</li>
        ) : null}
      </ScrollFade>
      <div className="mt-1 border-t border-border md:mx-1 md:pt-1">
        <button
          type="button"
          onClick={onNew}
          className="flex h-[52px] w-full items-center gap-3 px-5 text-left text-[15px] text-foreground-soft transition-colors hover:bg-hover hover:text-foreground md:h-[34px] md:gap-2 md:rounded-md md:px-2 md:text-[13px]"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          New notebook…
        </button>
      </div>
    </div>
  );
}
