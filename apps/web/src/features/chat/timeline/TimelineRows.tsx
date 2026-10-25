"use client";

import { WidgetFrame } from "@avenire/ui/widget-frame";
import { cn } from "@avenire/ui/lib/utils";
import {
  AlertCircle,
  Check,
  ChevronRight,
  Clapperboard,
  Download,
  LoaderCircle,
  Paperclip,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { createContext, memo, useContext, useState } from "react";

import type { ChatRow, MediaItem } from "../logic/types.ts";
import { ChatMarkdown } from "../markdown/Markdown.tsx";
import { Elapsed, formatDuration } from "./Elapsed.tsx";
import { ToolActivity } from "./ToolActivity.tsx";

export interface TimelineActions {
  readonly toggleWork: (messageId: string, expanded: boolean) => void;
  readonly colorScheme: "light" | "dark";
  readonly themeTokens: Readonly<Record<string, string>>;
}

export const TimelineContext = createContext<TimelineActions>({
  toggleWork: () => {},
  colorScheme: "dark",
  themeTokens: {},
});

/** Vertical rhythm per row kind (matches 12 / M21). */
const SPACING: Record<ChatRow["kind"], string> = {
  user: "pt-2 pb-6",
  "work-header": "pb-2",
  work: "pb-2",
  prose: "pb-4",
  reasoning: "pb-3",
  media: "pb-5",
  request: "pb-3",
  error: "pb-3",
  subagent: "pb-3",
  "cloud-run": "pb-3",
  thinking: "pb-4",
};

/** One timeline row, memoised on the row object (stabilised rows keep identity when unchanged). */
export const TimelineRow = memo(function TimelineRow({ row }: { readonly row: ChatRow }) {
  return (
    <div
      data-timeline-row-id={row.id}
      data-timeline-row-kind={row.kind}
      className={cn(
        "mx-auto w-full max-w-[46rem] px-5 @min-[776px]/timeline:px-0",
        SPACING[row.kind],
      )}
    >
      <RowBody row={row} />
    </div>
  );
});

function RowBody({ row }: { readonly row: ChatRow }) {
  switch (row.kind) {
    case "user":
      return <UserRow row={row} />;
    case "work-header":
      return <WorkHeader row={row} />;
    case "work":
      return <ToolActivity entries={row.entries} />;
    case "prose":
      return <ChatMarkdown text={row.text} streaming={row.streaming} />;
    case "reasoning":
      return <ReasoningRow text={row.text} streaming={row.streaming} />;
    case "media":
      return <MediaRow items={row.items} />;
    case "request":
      return (
        <div className="flex min-h-[30px] items-center gap-2.5 text-[14px] leading-5">
          {row.state === "waiting" ? (
            <LoaderCircle className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : row.state === "declined" ? (
            <X className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <Check className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span
            className={cn(
              "min-w-0 truncate",
              row.state === "waiting" ? "text-foreground" : "text-foreground-soft",
            )}
          >
            {row.label}
          </span>
        </div>
      );
    case "error":
      return (
        <div
          role="alert"
          className="flex items-start gap-2.5 text-[13.5px] leading-5 text-destructive"
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 break-words">{row.text}</span>
        </div>
      );
    case "subagent":
      return (
        <div className="flex min-h-[30px] items-center gap-2.5 text-[14px] text-foreground-soft">
          <Clapperboard className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate">{row.label}</span>
          {row.progress !== null ? (
            <span className="font-mono text-[11.5px] text-muted-foreground">
              {Math.round(row.progress * (row.progress <= 1 ? 100 : 1))}%
            </span>
          ) : null}
        </div>
      );
    case "cloud-run":
      return (
        <Link
          href={`/report/${row.runId}`}
          className="flex min-h-[30px] items-center gap-2.5 text-[14px] text-foreground-soft transition-colors hover:text-foreground"
        >
          <Sparkles className="size-3.5 shrink-0 text-ruth" />
          Ruth Cloud is working on this · Open
          <ChevronRight className="size-3 text-muted-foreground" />
        </Link>
      );
    case "thinking":
      return (
        <div className="flex h-6 items-center gap-2 text-[14px] text-foreground-soft">
          <span className="ruth-shimmer">{row.lastTool ? "Working" : "Thinking"}</span>
          {row.startedAt !== null ? (
            <span className="text-muted-foreground">
              <Elapsed since={row.startedAt} />
            </span>
          ) : null}
        </div>
      );
  }
}

function UserRow({ row }: { readonly row: Extract<ChatRow, { kind: "user" }> }) {
  return (
    <div className="flex flex-col items-end gap-1.5 pl-12 md:pl-24">
      <div className="max-w-full rounded-[18px] bg-white/[.06] px-3.5 py-2.5 text-[15px] leading-[21px] whitespace-pre-wrap break-words text-foreground md:rounded-2xl md:bg-white/[.04] md:text-[14px] md:leading-[22px]">
        {row.text}
      </div>
      {row.attachments.length ? (
        <div className="flex flex-wrap justify-end gap-1.5">
          {row.attachments.map((file) => (
            <a
              key={file.url}
              href={file.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-[26px] max-w-56 items-center gap-1.5 rounded-full border border-input px-2.5 text-xs text-foreground-soft hover:text-foreground"
            >
              <Paperclip className="size-3 shrink-0" />
              <span className="truncate">{file.name}</span>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function WorkHeader({ row }: { readonly row: Extract<ChatRow, { kind: "work-header" }> }) {
  const { toggleWork } = useContext(TimelineContext);
  const label = row.active ? (
    <>Working for {row.startedAt !== null ? <Elapsed since={row.startedAt} /> : "a moment"}</>
  ) : row.startedAt !== null && row.finishedAt !== null ? (
    <>Worked for {formatDuration(row.finishedAt - row.startedAt)}</>
  ) : (
    <>Worked on your request</>
  );
  return (
    <button
      type="button"
      aria-expanded={row.expanded}
      onClick={() => toggleWork(row.messageId, !row.expanded)}
      className="flex h-7 w-full items-center gap-1.5 border-b border-border pb-2.5 text-left text-[14px] text-foreground-soft transition-colors hover:text-foreground max-md:mb-1 md:w-auto md:border-0 md:pb-0"
    >
      <span>{label}</span>
      <ChevronRight
        className={cn(
          "size-3 text-muted-foreground transition-transform",
          row.expanded && "rotate-90",
        )}
      />
    </button>
  );
}

function ReasoningRow({ text, streaming }: { readonly text: string; readonly streaming: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-7 items-center gap-1.5 text-[14px] text-foreground-soft transition-colors hover:text-foreground"
      >
        <span className={streaming ? "ruth-shimmer" : undefined}>
          {streaming ? "Thinking" : "Thought it through"}
        </span>
        <ChevronRight
          className={cn("size-3 text-muted-foreground transition-transform", open && "rotate-90")}
        />
      </button>
      {open ? (
        <div className="mt-1 border-l border-border pl-3 text-[13.5px] leading-5 whitespace-pre-wrap text-muted-foreground">
          {text}
        </div>
      ) : null}
    </div>
  );
}

function MediaRow({ items }: { readonly items: readonly MediaItem[] }) {
  const tiles = items.filter((item) => item.kind === "image" || item.kind === "video");
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) =>
        item.kind === "widget" ? (
          <WidgetFigure key={item.id} item={item} />
        ) : item.kind === "pending" ? (
          <FigureFrame key={item.id} title={item.title}>
            <div className="flex h-40 items-center justify-center gap-2 text-[13px] text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin" />
              <span className="ruth-shimmer">Building {item.title}…</span>
            </div>
          </FigureFrame>
        ) : item.kind === "file" ? (
          <a
            key={item.id}
            href={`${item.url}?download=1`}
            download={item.title}
            className="flex h-10 items-center gap-2.5 rounded-lg border border-input px-3 text-[13.5px] text-foreground-soft hover:text-foreground"
          >
            <Download className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{item.title}</span>
            {item.sizeBytes !== null ? (
              <span className="text-xs text-muted-foreground">
                {(item.sizeBytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 0 })} KB
              </span>
            ) : null}
          </a>
        ) : null,
      )}
      {tiles.length ? (
        <div className={cn("grid gap-2.5", tiles.length > 1 && "grid-cols-2")}>
          {tiles.map((item) =>
            item.kind === "image" || item.kind === "video" ? (
              <FigureFrame key={item.id} title={item.title}>
                {item.kind === "image" ? (
                  <a href={item.url} target="_blank" rel="noreferrer" className="block">
                    <img
                      src={item.url}
                      alt={item.title}
                      loading="lazy"
                      className="mx-auto max-h-[28rem] w-full object-contain"
                    />
                  </a>
                ) : (
                  <video
                    src={item.url}
                    controls
                    preload="metadata"
                    playsInline
                    aria-label={item.title}
                    className="block max-h-[28rem] w-full bg-black"
                  />
                )}
              </FigureFrame>
            ) : null,
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Media stands on its own; keep its title available to assistive technology. */
export function FigureFrame({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <figure className="m-0" aria-label={title}>
      {children}
    </figure>
  );
}

export function WidgetFigure({ item }: { readonly item: Extract<MediaItem, { kind: "widget" }> }) {
  const { colorScheme, themeTokens } = useContext(TimelineContext);
  return (
    <FigureFrame title={item.title}>
      <WidgetFrame
        url={item.url}
        title={item.title}
        colorScheme={colorScheme}
        tokens={themeTokens}
        initialHeight={360}
      />
    </FigureFrame>
  );
}
