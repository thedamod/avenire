"use client";

import Link from "next/link";
import { memo } from "react";
import type { Folder } from "@avenire/contracts";
import { Plus } from "lucide-react";
import { ScrollFade } from "@avenire/ui/components/scroll-fade";
import { Skeleton } from "@avenire/ui/components/skeleton";
import { NotebookCover } from "~/components/app";
import { useApi } from "~/lib/rpc";
import { NotebookItemContextMenu } from "~/features/notebook/NotebookItemContextMenu";
import { prefetchNotebook } from "~/features/library/prefetch";

const tile = "h-[156px] w-[120px] shrink-0 md:h-[172px] md:w-[132px]";

/** Cover shelf: dashed "New notebook" tile first, then covers (01 / M01). */
export function NotebookShelf({
  folders,
  onNew,
  after,
}: {
  folders: readonly Folder[] | undefined;
  onNew: () => void;
  /** Extra tiles/blocks after the new-notebook tile (first-run steps). */
  after?: React.ReactNode;
}) {
  return (
    <ScrollFade
      axis="x"
      className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:gap-x-4 md:gap-y-6 md:overflow-visible md:px-0 md:[mask-image:none]"
    >
      <button
        type="button"
        onClick={onNew}
        className={`${tile} flex flex-col items-center justify-center gap-2 rounded-[3px_8px_8px_3px] border border-dashed border-input text-xs text-muted-foreground transition-colors outline-none hover:border-control-strong hover:text-foreground-soft focus-visible:ring-2 focus-visible:ring-ring/50`}
      >
        <Plus className="size-[18px] text-foreground-soft" strokeWidth={1.4} aria-hidden="true" />
        New notebook
      </button>
      {after}
      {folders === undefined
        ? Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className={`${tile} rounded-[3px_8px_8px_3px]`} />
          ))
        : folders.map((folder) => <ShelfCover key={folder.id} folder={folder} />)}
    </ScrollFade>
  );
}

const ShelfCover = memo(function ShelfCover({ folder }: { folder: Folder }) {
  const api = useApi();
  const warm = () => {
    void prefetchNotebook(api, folder.id);
  };
  return (
    <NotebookItemContextMenu folder={folder}>
      <Link
        href={`/notebooks/${folder.id}`}
        onPointerEnter={warm}
        onFocus={warm}
        onTouchStart={warm}
        aria-label={`${folder.name}, ${folder.noteCount} notes, ${folder.sourceCount} sources`}
        className="shrink-0 rounded-[3px_8px_8px_3px] outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring/60 fine-hover:hover:-translate-y-0.5"
      >
        <NotebookCover folder={folder} className="max-md:text-[9.1px]" />
      </Link>
    </NotebookItemContextMenu>
  );
});
