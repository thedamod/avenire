"use client";

import type { FileId, Folder, FolderId, LibraryFile } from "@avenire/contracts";
import { attachScrollFade } from "@avenire/ui/components/scroll-fade";
import { cn } from "@avenire/ui/lib/utils";
import {
  AlignLeft,
  ArrowUpRight,
  CircleHelp,
  FileText,
  Maximize2,
  Minimize2,
  PanelRightClose,
  Triangle,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { memo, useEffect, useRef } from "react";

import { FileKindIcon } from "~/components/app";
import type { Quiz } from "./logic/quiz.ts";
import type { OutputTab } from "./logic/report.ts";
import NotePane, { NoteSkeleton } from "./panes/NotePane.tsx";
import { QuizSkeleton } from "./panes/QuizPane.tsx";
import { sourceHref } from "./ReportContext.ts";

const QuizPane = dynamic(() => import("./panes/QuizPane.tsx"), {
  ssr: false,
  loading: () => <QuizSkeleton />,
});
const WidgetPane = dynamic(() => import("./panes/WidgetPane.tsx"), {
  ssr: false,
  loading: () => (
    <div className="px-4 pt-3 md:px-7 md:pt-8">
      <div className="h-[512px] animate-pulse rounded-lg bg-white/[.04]" />
    </div>
  ),
});
const SourcePane = dynamic(() => import("./panes/SourcePane.tsx"), {
  ssr: false,
  loading: () => (
    <div className="px-5 pt-3">
      <div className="mx-auto aspect-[1/1.294] w-full max-w-[440px] animate-pulse bg-white/[.04]" />
    </div>
  ),
});

export interface PaneData {
  readonly fileById: ReadonlyMap<FileId, LibraryFile>;
  readonly folderById: ReadonlyMap<FolderId, Folder>;
  readonly quizzes: ReadonlyMap<FileId, Quiz | null>;
  readonly mainKey: string | undefined;
  readonly startHere: string | null;
  /** Library files the run read. */
  readonly sources: number;
}

export function TabIcon({ tab, main, data }: { tab: OutputTab; main: boolean; data: PaneData }) {
  switch (tab.kind) {
    case "note":
      return main ? <FileText className="size-3.5" /> : <AlignLeft className="size-3.5" />;
    case "quiz":
      return <CircleHelp className="size-3.5" />;
    case "widget":
      return <Triangle className="size-3.5" />;
    case "source": {
      const file = data.fileById.get(tab.fileId);
      return file ? (
        <FileKindIcon kind={file.kind} url={file.sourceUrl} size={14} />
      ) : (
        <FileText className="size-3.5" />
      );
    }
  }
}

/** Where the tab's content lives as its own page (the phone's ↗ button). */
function pageHref(tab: OutputTab): string | null {
  if (tab.kind === "note") return `/notes/${tab.fileId}`;
  if (tab.kind === "source") return sourceHref({ fileId: tab.fileId, target: tab.target });
  if (tab.kind === "quiz") return `/sources/${tab.fileId}`;
  return null;
}

const iconButton =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-foreground-soft transition-colors hover:bg-hover hover:text-foreground [&_svg]:size-4";

/**
 * The run's outputs, one tab each: the desktop right pane (08, 16a–c, 14a) and the phone's
 * full-height sheet (M13–M16) render this same component.
 */
export const OutputPane = memo(function OutputPane({
  variant,
  tabs,
  activeKey,
  onSelect,
  onCloseTab,
  expanded = false,
  onToggleExpanded,
  onClosePane,
  data,
}: {
  readonly variant: "pane" | "sheet";
  readonly tabs: readonly OutputTab[];
  readonly activeKey: string | undefined;
  readonly onSelect: (key: string) => void;
  readonly onCloseTab: (key: string) => void;
  readonly expanded?: boolean;
  readonly onToggleExpanded?: () => void;
  readonly onClosePane?: () => void;
  readonly data: PaneData;
}) {
  const active = tabs.find((tab) => tab.key === activeKey) ?? tabs[0];
  const strip = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);

  // Keep the active tab in view and start each tab at its top.
  useEffect(() => {
    strip.current
      ?.querySelector<HTMLElement>(`[data-key="${CSS.escape(active?.key ?? "")}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    body.current?.scrollTo({ top: 0 });
  }, [active?.key]);

  // Edge fades on the tab row (x) and the pane body (y).
  useEffect(() => {
    const cleanups = [
      strip.current && attachScrollFade(strip.current, "x"),
      body.current && attachScrollFade(body.current, "y"),
    ];
    return () => {
      for (const cleanup of cleanups) cleanup?.();
    };
  }, []);

  const widgets = tabs.filter((tab) => tab.kind === "widget");
  const href = active ? pageHref(active) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={cn(
          "flex shrink-0 items-center gap-1 border-border",
          variant === "pane" ? "h-[52px] px-3" : "h-12 px-4",
        )}
      >
        <div
          ref={strip}
          role="tablist"
          aria-label="Made overnight"
          className="edge-fade-x flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((tab) => {
            const selected = tab.key === active?.key;
            return (
              <div
                key={tab.key}
                data-key={tab.key}
                className={cn(
                  "flex h-8 shrink-0 items-center rounded-lg transition-colors",
                  selected ? "bg-white/[.07] text-foreground" : "text-foreground-soft",
                )}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  title={tab.title}
                  onClick={() => onSelect(tab.key)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 px-2.5 text-[14px] whitespace-nowrap hover:text-foreground md:text-[13px]",
                    selected && "font-semibold",
                    tab.kind === "source" && tab.transient && "pr-1",
                  )}
                >
                  <TabIcon tab={tab} main={tab.key === data.mainKey} data={data} />
                  <span className="max-w-[12rem] truncate">{tab.label}</span>
                </button>
                {tab.kind === "source" && tab.transient ? (
                  <button
                    type="button"
                    aria-label={`Close ${tab.label}`}
                    onClick={() => onCloseTab(tab.key)}
                    className="mr-1 inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        {variant === "pane" ? (
          <>
            {onToggleExpanded ? (
              <button
                type="button"
                aria-label={expanded ? "Back to the report" : "Expand"}
                onClick={onToggleExpanded}
                className={iconButton}
              >
                {expanded ? <Minimize2 /> : <Maximize2 />}
              </button>
            ) : null}
            {onClosePane ? (
              <button
                type="button"
                aria-label="Close pane"
                onClick={onClosePane}
                className={iconButton}
              >
                <PanelRightClose />
              </button>
            ) : null}
          </>
        ) : href ? (
          <Link href={href} aria-label="Open as a page" className={cn(iconButton, "size-10")}>
            <ArrowUpRight />
          </Link>
        ) : null}
      </div>
      <div
        ref={body}
        role="tabpanel"
        className={cn(
          "edge-fade-y min-h-0 flex-1 overflow-y-auto overscroll-contain",
          active?.kind === "source" && "flex flex-col overflow-hidden",
          variant === "sheet" && "pb-[env(safe-area-inset-bottom)]",
        )}
      >
        {active ? (
          // Each tab's content fades in on switch; the old one is gone at once (no overlap).
          <div
            key={active.key}
            className={cn("enter-fade", active.kind === "source" && "flex min-h-0 flex-1 flex-col")}
          >
            <TabBody
              tab={active}
              data={data}
              figure={widgets.findIndex((tab) => tab.key === active.key) + 1}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
});

function TabBody({
  tab,
  data,
  figure,
}: {
  readonly tab: OutputTab;
  readonly data: PaneData;
  readonly figure: number;
}) {
  switch (tab.kind) {
    case "note": {
      const file = data.fileById.get(tab.fileId);
      const folder = file?.folderIds.map((id) => data.folderById.get(id)).find(Boolean);
      return (
        <NotePane
          key={tab.fileId}
          fileId={tab.fileId}
          label={tab.label}
          folder={folder}
          createdAt={file?.createdAt}
          sources={data.sources}
          startHere={tab.key === data.mainKey ? data.startHere : null}
        />
      );
    }
    case "quiz":
      return (
        <QuizPane
          key={tab.fileId}
          fileId={tab.fileId}
          quiz={data.quizzes.get(tab.fileId)}
          fileById={data.fileById}
        />
      );
    case "widget":
      return (
        <WidgetPane
          key={tab.key}
          url={tab.url}
          title={tab.title}
          figure={figure}
          createdAt={tab.createdAt}
        />
      );
    case "source":
      return <SourcePane fileId={tab.fileId} target={tab.target} />;
  }
}

export { NoteSkeleton };
