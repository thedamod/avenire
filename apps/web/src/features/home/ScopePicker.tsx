"use client";

import type { Folder, FolderId } from "@avenire/contracts";
import { Check, ChevronDown, Folder as FolderIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@avenire/ui/components/dropdown-menu";
import { cn } from "@avenire/ui/lib/utils";
import { NotebookSwatch } from "~/components/app";

/** "All notebooks" / one notebook: what Search and Ask Ruth look at. */
export function ScopePicker({
  folders,
  scope,
  onScopeChange,
  className,
}: {
  folders: readonly Folder[];
  scope: FolderId | null;
  onScopeChange: (scope: FolderId | null) => void;
  className?: string | undefined;
}) {
  const current = scope ? folders.find((folder) => folder.id === scope) : undefined;
  const item = "h-11 text-[15px] md:h-[30px] md:text-[13px]";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex h-8 min-w-0 items-center gap-2 rounded-lg text-[13px] text-foreground-soft transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
          className,
        )}
      >
        {current ? (
          <NotebookSwatch color={current.color} />
        ) : (
          <FolderIcon className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        )}
        <span className="truncate">{current ? `${current.name} only` : "All notebooks"}</span>
        <ChevronDown className="size-3 shrink-0 md:hidden" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" data-mobile-sheet="true" className="w-64">
        <DropdownMenuItem className={item} onSelect={() => onScopeChange(null)}>
          <FolderIcon />
          All notebooks
          {scope === null ? <Check className="ml-auto" /> : null}
        </DropdownMenuItem>
        {folders.length ? <DropdownMenuSeparator /> : null}
        {folders.map((folder) => (
          <DropdownMenuItem
            key={folder.id}
            className={item}
            onSelect={() => onScopeChange(folder.id)}
          >
            <NotebookSwatch color={folder.color} />
            <span className="truncate">{folder.name}</span>
            {scope === folder.id ? <Check className="ml-auto" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
