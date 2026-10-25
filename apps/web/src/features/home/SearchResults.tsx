"use client";

import Link from "next/link";
import { memo, useMemo } from "react";
import type { FileId, Folder, FolderId, LibraryFile, SearchHit } from "@avenire/contracts";
import { Checkbox } from "@avenire/ui/components/checkbox";
import { Skeleton } from "@avenire/ui/components/skeleton";
import { cn } from "@avenire/ui/lib/utils";
import { FileKindIcon } from "~/components/app";
import { FileItemContextMenu } from "~/features/library/FileItemContextMenu";
import type { ActionFile } from "~/features/library/fileActions";
import type { Selection } from "~/features/library/useSelection";
import { useLongPress } from "~/features/library/useSelection";
import { useQuery } from "~/lib/rpc";
import { formatTimestamp } from "~/lib/time";
import { ErrorRow } from "./states";

// Query keys feed the projection matcher by substring, so never put user text in them.
function hashKey(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1)
    hash = (hash * 33) ^ value.charCodeAt(index);
  return (hash >>> 0).toString(36);
}

export function hitHref(hit: SearchHit): string {
  if (hit.fileKind === "note") return `/notes/${hit.fileId}`;
  const { page, startSec } = hit.location;
  if (page !== undefined) return `/sources/${hit.fileId}?page=${page}`;
  if (startSec !== undefined) return `/sources/${hit.fileId}?t=${Math.floor(startSec)}`;
  return `/sources/${hit.fileId}`;
}

function hitLocation(
  hit: SearchHit,
  file: LibraryFile | undefined,
  folderById: ReadonlyMap<FolderId, Folder>,
) {
  if (hit.fileKind === "note") {
    const folder = file?.folderIds[0] ? folderById.get(file.folderIds[0]) : undefined;
    const owner =
      file?.source === "ruth" || file?.source === "ruth-cloud" ? "Ruth's note" : "Your note";
    return folder ? `${owner} · ${folder.name}` : owner;
  }
  const { page, slide, startSec, endSec, heading, sheet } = hit.location;
  if (page !== undefined) return `Page ${page}`;
  if (slide !== undefined) return `Slide ${slide}`;
  if (startSec !== undefined)
    return endSec !== undefined
      ? `${formatTimestamp(startSec)} – ${formatTimestamp(endSec)}`
      : formatTimestamp(startSec);
  if (heading) return `§ ${heading}`;
  if (sheet) return `Sheet ${sheet}`;
  return null;
}

/** Search results replace the tabs while `?q=` is set (17 / M07). */
export function SearchResults({
  query,
  scope,
  context,
  files,
  folderById,
  selection,
}: {
  query: string;
  scope: FolderId | null;
  context: readonly FileId[];
  files: readonly LibraryFile[] | undefined;
  folderById: ReadonlyMap<FolderId, Folder>;
  selection: Selection;
}) {
  const key = `search-${hashKey(JSON.stringify([query, scope, context]))}`;
  const result = useQuery(
    (client) =>
      client["search.query"]({
        text: query,
        limit: 30,
        ...(scope ? { folderIds: [scope] } : {}),
        ...(context.length ? { fileIds: [...context] } : {}),
      }),
    key,
  );
  const fileById = useMemo(
    () => new Map((files ?? []).map((file) => [file.id, file] as const)),
    [files],
  );
  // One row per file: the best-ranked passage.
  const hits = useMemo(() => {
    const seen = new Set<FileId>();
    return (result.data?.hits ?? []).filter((hit) => !seen.has(hit.fileId) && seen.add(hit.fileId));
  }, [result.data]);

  const loading = result.loading && !result.data;
  return (
    <section aria-label="Search results" className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4 text-[12.5px] text-muted-foreground max-md:hidden">
        <span>
          {loading ? "Searching…" : `${hits.length} matching file${hits.length === 1 ? "" : "s"}`}
        </span>
        <span>Want an explanation? Press Enter to ask Ruth</span>
      </div>
      <p className="text-[13px] text-muted-foreground md:hidden">
        {loading ? "Searching…" : `${hits.length} matching file${hits.length === 1 ? "" : "s"}`}
      </p>
      {loading ? (
        Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="flex gap-4 md:gap-[18px]">
            <Skeleton className="h-[92px] w-[74px] shrink-0 rounded-md md:h-[124px] md:w-24" />
            <div className="flex flex-1 flex-col gap-2 pt-1">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
        ))
      ) : result.error && !result.data ? (
        <ErrorRow error={result.error} onRetry={() => void result.refetch()} />
      ) : hits.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-input px-5 py-8 text-center text-[13px] text-muted-foreground">
          Nothing in your files matches that. Press Enter to ask Ruth instead.
        </div>
      ) : (
        hits.map((hit) => (
          <HitRow
            key={hit.chunkId}
            hit={hit}
            file={
              fileById.get(hit.fileId) ?? {
                id: hit.fileId,
                kind: hit.fileKind,
                title: hit.fileTitle,
                folderIds: [],
              }
            }
            selection={selection}
            location={hitLocation(hit, fileById.get(hit.fileId), folderById)}
            sourceUrl={fileById.get(hit.fileId)?.sourceUrl ?? null}
            selected={selection.has(hit.fileId)}
            selecting={selection.size > 0}
            onToggle={selection.toggle}
          />
        ))
      )}
    </section>
  );
}

const HitRow = memo(function HitRow({
  hit,
  file,
  selection,
  location,
  sourceUrl,
  selected,
  selecting,
  onToggle,
}: {
  hit: SearchHit;
  file: ActionFile;
  selection: Selection;
  location: string | null;
  sourceUrl: string | null;
  selected: boolean;
  selecting: boolean;
  onToggle: (id: FileId) => void;
}) {
  const { handlers, consumeClick } = useLongPress(() => onToggle(hit.fileId));
  const quoted = hit.fileKind !== "note" && hit.fileKind !== "pdf" && hit.fileKind !== "document";
  const snippet = hit.content.replace(/\s+/g, " ").trim();
  return (
    <FileItemContextMenu file={file} href={hitHref(hit)} selection={selection}>
      <div className="group/hit relative flex gap-4 select-none md:gap-[18px]" {...handlers}>
        <div
          className={cn(
            "relative flex h-[92px] w-[74px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-3 md:h-[124px] md:w-24",
            selected && "border-ruth-line",
          )}
        >
          <FileKindIcon kind={hit.fileKind} size={18} />
          {hit.location.startSec !== undefined ? (
            <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1 font-mono text-[11px] leading-4 text-white">
              {formatTimestamp(hit.location.startSec)}
            </span>
          ) : null}
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggle(hit.fileId)}
            aria-label={`Select ${hit.fileTitle}`}
            className={cn(
              "absolute top-2 left-2 z-10 opacity-0 transition-opacity md:group-hover/hit:opacity-100",
              (selecting || selected) && "opacity-100",
              !(selecting || selected) && "max-md:pointer-events-none",
            )}
          />
        </div>
        <Link
          href={hitHref(hit)}
          draggable={false}
          onClick={(event) => {
            if (consumeClick()) event.preventDefault();
            else if (selecting) {
              event.preventDefault();
              onToggle(hit.fileId);
            }
          }}
          className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5 outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-ring/50 md:gap-1.5 md:pt-2"
        >
          <span className="flex min-w-0 items-center gap-2">
            <FileKindIcon kind={hit.fileKind} url={sourceUrl} size={15} />
            <span className="truncate text-[15px] leading-5 font-semibold md:text-[14.5px]">
              {hit.fileTitle}
            </span>
          </span>
          {location ? (
            <span className="text-[12.5px] leading-4 text-muted-foreground">{location}</span>
          ) : null}
          <span className="line-clamp-2 text-[13.5px] leading-5 text-foreground-soft md:leading-[21px]">
            {quoted ? `“…${snippet}…”` : snippet}
          </span>
        </Link>
      </div>
    </FileItemContextMenu>
  );
});
