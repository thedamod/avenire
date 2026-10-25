"use client";

import type { FileId, Folder } from "@avenire/contracts";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Skeleton } from "@avenire/ui/components/skeleton";

import { ErrorRow } from "~/features/home/states";
import { ChatMarkdown } from "~/features/chat/markdown/Markdown";
import { Aside } from "~/features/sources/parts";
import { useQuery } from "~/lib/rpc";
import { clockTime } from "../logic/report.ts";

/** A note Ruth Cloud wrote, read-only (08 / M13). Editing lives on the note page. */
export default function NotePane({
  fileId,
  label,
  folder,
  createdAt,
  sources,
  startHere,
}: {
  readonly fileId: FileId;
  readonly label: string;
  readonly folder: Folder | undefined;
  readonly createdAt: string | undefined;
  /** How many library files the run read. */
  readonly sources: number;
  /** Ruth's one-line pointer, on the report's main note only. */
  readonly startHere: string | null;
}) {
  const note = useQuery((client) => client["library.getNote"]({ fileId }), `report-note-${fileId}`);
  // The note's own H1 is the pane's title.
  const body = useMemo(() => {
    const markdown = note.data?.markdown ?? "";
    const title = note.data?.title ?? "";
    const match = /^\s*#\s+(.+)\n+/.exec(markdown);
    return {
      title: match ? match[1]!.trim() : title,
      markdown: match ? markdown.slice(match[0].length) : markdown,
    };
  }, [note.data]);

  const meta = [
    sources
      ? `Written overnight from ${sources} ${sources === 1 ? "source" : "sources"}`
      : "Written overnight",
    createdAt ? clockTime(createdAt) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="flex flex-col gap-4 px-5 pt-2 pb-10 md:px-7 md:pt-1">
      <nav
        aria-label="Where this note lives"
        className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted-foreground max-md:hidden"
      >
        {folder ? (
          <>
            <Link href={`/notebooks/${folder.id}`} className="truncate hover:text-foreground">
              {folder.name}
            </Link>
            <ChevronRight className="size-3 shrink-0" />
          </>
        ) : null}
        <span className="shrink-0">Notes</span>
        <ChevronRight className="size-3 shrink-0" />
        <span className="truncate font-medium text-foreground">{label}</span>
      </nav>
      {startHere ? <Aside tone="ruth">{startHere}</Aside> : null}
      {note.data ? (
        <>
          <header className="flex flex-col gap-1.5">
            <h1 className="text-[22px] leading-[28px] font-semibold text-balance md:text-[24px] md:leading-[30px]">
              {body.title}
            </h1>
            <p className="text-[12.5px] text-muted-foreground">{meta}</p>
          </header>
          <ChatMarkdown text={body.markdown} className="text-[15px] md:text-[14px]" />
          <Link
            href={`/notes/${fileId}`}
            className="inline-flex h-8 items-center gap-1.5 self-start text-[13px] text-foreground-soft hover:text-foreground"
          >
            Open note
            <ArrowUpRight className="size-3.5" />
          </Link>
        </>
      ) : note.error ? (
        <ErrorRow error={note.error} onRetry={() => void note.refetch()} />
      ) : (
        <NoteSkeleton />
      )}
    </article>
  );
}

export function NoteSkeleton() {
  return (
    <div aria-label="Loading note" className="flex flex-col gap-4">
      <Skeleton className="h-7 w-3/4" />
      <Skeleton className="h-3.5 w-1/2" />
      <div className="flex flex-col gap-2 pt-1">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <Skeleton className="h-12 w-full" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}
