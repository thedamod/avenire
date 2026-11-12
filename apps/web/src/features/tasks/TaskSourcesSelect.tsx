"use client";

import { useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import type { Folder, FolderId } from "@avenire/contracts";
import { ScrollFade } from "@avenire/ui/components/scroll-fade";
import { Button } from "@avenire/ui/components/button";
import { Checkbox } from "@avenire/ui/components/checkbox";
import { Input } from "@avenire/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@avenire/ui/components/popover";
import { NotebookSwatch } from "~/components/app/NotebookSwatch";

export function TaskSourcesSelect({
  folders,
  folderIds,
  todaysCaptures,
  onFolderIdsChange,
  onTodaysCapturesChange,
  loading,
  error,
}: {
  folders: readonly Folder[];
  folderIds: readonly FolderId[];
  todaysCaptures: boolean;
  onFolderIdsChange: (ids: FolderId[]) => void;
  onTodaysCapturesChange: (checked: boolean) => void;
  loading: boolean;
  error: boolean;
}) {
  const [search, setSearch] = useState("");
  const selectedNames = [
    ...(todaysCaptures ? ["Today's captures"] : []),
    ...folders.filter((folder) => folderIds.includes(folder.id)).map((folder) => folder.name),
  ];
  const count = selectedNames.length;
  const query = search.trim().toLocaleLowerCase();
  const visibleFolders = folders.filter((folder) =>
    folder.name.toLocaleLowerCase().includes(query),
  );
  const showCaptures = "today's captures".includes(query);

  return (
    <Popover onOpenChange={() => setSearch("")}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={`Ava can read: ${count} selected`}
          className="h-11 w-full min-w-0 max-w-full justify-between gap-3 overflow-hidden px-3 font-normal md:h-9"
        >
          <span
            className={`block min-w-0 flex-1 truncate text-left ${count ? "text-foreground" : "text-muted-foreground"}`}
          >
            {count ? selectedNames.join(", ") : "Choose sources"}
          </span>
          <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
            {count > 1 ? <span className="text-xs">{count} selected</span> : null}
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) max-w-[calc(100vw-40px)] overflow-hidden p-0"
      >
        <div className="relative border-b border-border p-2">
          <Search
            className="pointer-events-none absolute top-1/2 left-5 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search sources"
            placeholder="Search notebooks…"
            className="h-9 border-0 bg-transparent pl-9 shadow-none"
          />
        </div>
        <ScrollFade
          role="group"
          aria-label="Sources Ava can read"
          className="max-h-[min(280px,40dvh)] overflow-y-auto p-1.5"
        >
          {showCaptures ? (
            <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2.5 text-[13px] hover:bg-hover">
              <Checkbox
                checked={todaysCaptures}
                onCheckedChange={(checked) => onTodaysCapturesChange(checked === true)}
              />
              <span className="min-w-0 truncate">Today's captures</span>
            </label>
          ) : null}
          {visibleFolders.map((folder) => {
            const checked = folderIds.includes(folder.id);
            return (
              <label
                key={folder.id}
                className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2.5 text-[13px] hover:bg-hover"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(value) =>
                    onFolderIdsChange(
                      value === true
                        ? [...folderIds, folder.id]
                        : folderIds.filter((id) => id !== folder.id),
                    )
                  }
                />
                <NotebookSwatch color={folder.color} />
                <span className="min-w-0 truncate" title={folder.name}>
                  {folder.name}
                </span>
              </label>
            );
          })}
          {loading || error ? (
            <p role="status" className="px-3 py-2 text-xs text-muted-foreground">
              {error ? "Couldn't load notebooks." : "Loading notebooks…"}
            </p>
          ) : null}
          {!loading && !error && !visibleFolders.length && !showCaptures ? (
            <p className="px-3 py-4 text-[13px] text-muted-foreground">No sources match.</p>
          ) : null}
        </ScrollFade>
        <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <span>{count} selected</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!count}
            onClick={() => {
              onFolderIdsChange([]);
              onTodaysCapturesChange(false);
            }}
          >
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
