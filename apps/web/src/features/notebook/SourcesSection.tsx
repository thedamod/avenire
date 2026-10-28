"use client";

import Link from "next/link";
import { memo } from "react";
import type { FileId, IngestionJob, LibraryFile } from "@avenire/contracts";
import { useScrollFade } from "@avenire/ui/components/scroll-fade";
import { useArrivedLate } from "@avenire/ui/components/presence";
import { Skeleton } from "@avenire/ui/components/skeleton";
import { cn } from "@avenire/ui/lib/utils";
import { FileKindIcon, KIND_LABELS, RelativeTime } from "~/components/app";
import { FileRow, fileHref } from "~/features/library/FileRow";
import { FileItemContextMenu } from "~/features/library/FileItemContextMenu";
import { useLongPress } from "~/features/library/useSelection";
import { PresenceRows } from "~/features/library/PresenceRows";
import { ingestionState, type IngestionState } from "~/features/library/ingestion";
import type { Selection } from "~/features/library/useSelection";
import { originLabel, savedOn } from "~/features/sources/reopen";
import { formatTimestamp } from "~/lib/time";
import { EmptyLine, SectionHeading } from "./parts";

/** How many cards the collapsed section shows (one desktop row; the phone strip scrolls). */
const PREVIEW = 8;

/**
 * Sources of the notebook (07 / M09). Collapsed: a row of cards (a horizontal strip on phone).
 * "View all" turns it into the full list, where rows select for the dock (move, trash).
 */
export function SourcesSection({
  sources,
  jobs,
  expanded,
  onExpandedChange,
  selection,
}: {
  sources: readonly LibraryFile[] | undefined;
  jobs: ReadonlyMap<FileId, IngestionJob>;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  selection: Selection;
}) {
  const stripFade = useScrollFade<HTMLUListElement>("x");
  const late = useArrivedLate(sources);
  return (
    <section aria-labelledby="notebook-sources" className="flex flex-col gap-3 md:gap-4">
      <SectionHeading id="notebook-sources" label="Sources" count={sources?.length}>
        {sources?.length ? (
          <button
            type="button"
            onClick={() => {
              if (expanded) selection.clear();
              onExpandedChange(!expanded);
            }}
            className="-mr-2 h-11 px-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground md:h-8 md:text-xs"
          >
            {expanded ? "Show less" : "View all"}
          </button>
        ) : null}
      </SectionHeading>
      {sources === undefined ? (
        <CardsSkeleton />
      ) : sources.length === 0 ? (
        <EmptyLine>
          No sources here yet. Move sources in from Home, or capture a PDF, video or page on your
          computer.
        </EmptyLine>
      ) : expanded ? (
        <div
          className={cn(
            late && "enter-fade",
            "-mx-4 divide-y divide-border md:mx-0 md:overflow-hidden md:rounded-[10px] md:border md:border-border md:bg-card",
          )}
        >
          <PresenceRows items={sources}>
            {(file) => (
              <SourceListRow
                file={file}
                selection={selection}
                state={ingestionState(jobs.get(file.id), file)}
                selected={selection.has(file.id)}
                selecting={selection.size > 0}
                onToggle={selection.toggle}
              />
            )}
          </PresenceRows>
        </div>
      ) : (
        <ul
          ref={stripFade}
          className={cn(
            late && "enter-fade",
            "-mx-4 flex gap-2.5 overflow-x-auto px-4 [scrollbar-width:none] max-md:edge-fade-x md:mx-0 md:grid md:grid-cols-4 md:gap-3 md:overflow-visible md:px-0 md:[&>li:nth-child(n+5)]:hidden",
          )}
        >
          {sources.slice(0, PREVIEW).map((file) => (
            <li key={file.id} className="w-[150px] shrink-0 md:w-auto">
              <SourceCard
                selection={selection}
                file={file}
                state={ingestionState(jobs.get(file.id), file)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** "arxiv.org · saved at 18:40", "Preview · notes.pdf · Saved on …", or what the reader is doing. */
function sourceMeta(file: LibraryFile): string {
  const parts = [originLabel(file) ?? KIND_LABELS[file.kind]];
  if (file.mediaPositionSec) parts.push(`saved at ${formatTimestamp(file.mediaPositionSec)}`);
  const device = savedOn(file);
  if (device) parts.push(device);
  return parts.join(" · ");
}

function stateLine(state: IngestionState): { text: string; tone: string } {
  switch (state.kind) {
    case "processing":
      return { text: `${state.label}…`, tone: "text-foreground-soft" };
    case "paused":
      return { text: "Paused", tone: "text-foreground-soft" };
    case "password":
      return { text: "Password-protected", tone: "text-destructive/85" };
    case "paywall":
      return { text: "Behind a paywall", tone: "text-warning" };
    case "login":
      return { text: `Needs your ${state.site ?? "site"} login`, tone: "text-warning" };
    case "failed":
      return { text: "Couldn't read it", tone: "text-destructive/85" };
  }
}

export const SourceCard = memo(function SourceCard({
  file,
  selection,
  state,
}: {
  file: LibraryFile;
  state: IngestionState | null;
  selection: Selection;
}) {
  const line = state ? stateLine(state) : null;
  const { handlers, consumeClick } = useLongPress(() => selection.toggle(file.id));
  return (
    <FileItemContextMenu file={file} href={fileHref(file)} selection={selection}>
      <Link
        {...handlers}
        data-selected={selection.has(file.id) || undefined}
        onClick={(event) => {
          if (consumeClick()) event.preventDefault();
          else if (selection.size) {
            event.preventDefault();
            selection.toggle(file.id);
          }
        }}
        href={fileHref(file)}
        className="data-[selected]:bg-surface-3 flex h-[118px] flex-col gap-2 rounded-[10px] border border-border bg-card p-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 hover:border-input hover:bg-surface-3 md:px-4 md:pt-4 md:pb-3.5"
      >
        <FileKindIcon kind={file.kind} url={file.sourceUrl} />
        <span className="line-clamp-2 text-[14px] leading-[18px] font-medium md:text-[13.5px]">
          {file.title}
        </span>
        <span className="mt-auto flex min-w-0 flex-col gap-1.5">
          {state?.kind === "processing" ? <Sweep /> : null}
          <span className={cn("truncate text-xs leading-4", line?.tone ?? "text-muted-foreground")}>
            {line?.text ?? sourceMeta(file)}
          </span>
        </span>
      </Link>
    </FileItemContextMenu>
  );
});

const SourceListRow = memo(function SourceListRow({
  file,
  selection,
  state,
  selected,
  selecting,
  onToggle,
}: {
  file: LibraryFile;
  selection: Selection;
  state: IngestionState | null;
  selected: boolean;
  selecting: boolean;
  onToggle: (id: FileId) => void;
}) {
  const line = state ? stateLine(state) : null;
  return (
    <FileRow
      selection={selection}
      file={file}
      subtitle={line ? <span className={line.tone}>{line.text}</span> : sourceMeta(file)}
      below={state?.kind === "processing" ? <Sweep /> : null}
      trailing={<RelativeTime iso={file.createdAt} className="md:w-16 md:text-right" />}
      selected={selected}
      selecting={selecting}
      onToggle={onToggle}
    />
  );
});

function Sweep() {
  return (
    <span className="relative block h-0.5 w-full overflow-hidden rounded-full bg-border">
      <span className="animate-sweep absolute inset-y-0 left-0 w-2/5 rounded-full bg-foreground/80" />
    </span>
  );
}

function CardsSkeleton() {
  return (
    <div className="-mx-4 flex gap-2.5 overflow-hidden px-4 md:mx-0 md:grid md:grid-cols-4 md:gap-3 md:px-0">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="flex h-[118px] w-[150px] shrink-0 flex-col gap-2 rounded-[10px] border border-border p-3 md:w-auto md:p-4"
        >
          <Skeleton className="size-4" />
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-3.5 w-3/5" />
          <Skeleton className="mt-auto h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
