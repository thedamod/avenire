"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FileContentUrl, FileId, LibraryFile } from "@avenire/contracts";
import { call } from "@avenire/client-runtime/rpc";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@avenire/ui/components/button";
import { Skeleton } from "@avenire/ui/components/skeleton";
import { cn } from "@avenire/ui/lib/utils";
import { FileKindIcon, RelativeTime } from "~/components/app";
import { ErrorRow } from "~/features/home/states";
import { useLibrary } from "~/features/library/LibraryProvider";
import {
  ingestionState,
  keepSource,
  useIngestionJobs,
  type IngestionState,
} from "~/features/library/ingestion";
import { useApi, useQuery } from "~/lib/rpc";
import { youtubeId, type Region } from "./citation";
import { ImageView } from "./ImageView";
import { MediaView, YouTubeView } from "./MediaView";
import { officeType } from "./office-type";
import { Aside, CitedChip } from "./parts";
import { hasOriginal, originLabel, savedOn } from "./reopen";
import { useIsDesktop, useReopenFile } from "./useReopenFile";
import { OpenOriginalContext } from "./ViewerDock";
import { TextView, isReadableText } from "./TextView";
import { ViewerLoading } from "./ViewerLoading";

const OfficeView = dynamic(() => import("./OfficeView"), { ssr: false });

const PdfView = dynamic(() => import("./PdfView"), {
  ssr: false,
  loading: () => <ViewerLoading label="Loading PDF" />,
});

export interface SourceViewerProps {
  readonly fileId: FileId;
  /** PDF page to open at (1-based); briefly highlighted. */
  readonly page?: number | undefined;
  /** Media position in seconds. */
  readonly t?: number | undefined;
  /** Normalised 0–1 box to outline on an image. */
  readonly region?: Region | undefined;
  /** Words to mark in a PDF's text. */
  readonly q?: string | undefined;
  /** Inside a half-height sheet or side pane (M18–M20, 14a–c): tighter padding, own scroll. */
  readonly compact?: boolean;
}

/**
 * The body of a source, opened at a citation: PDF at a page, video at a time, image on a
 * region, text for pages and documents, or a clean card when nothing can be shown inline.
 * Standalone so chat can put it in a sheet or pane; `/sources/[fileId]` wraps it with a header.
 */
export function SourceViewer(props: SourceViewerProps) {
  const file = useQuery(
    (client) => client["library.getFile"]({ fileId: props.fileId }),
    `source-files-${props.fileId}`,
  );
  if (file.data) return <SourceViewerBody file={file.data} {...props} />;
  if (file.error)
    return (
      <div className={cn(props.compact && "p-4")}>
        <ErrorRow error={file.error} onRetry={() => void file.refetch()} />
      </div>
    );
  // The kind isn't known yet: hold a neutral viewer-sized frame that fills the pane, under the
  // same row a framed viewer keeps for its cited chip and "Open original".
  if (!props.compact) return <ViewerLoading className="min-h-[420px]" />;
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
      <div aria-hidden="true" className="min-h-8 shrink-0" />
      <ViewerLoading className="min-h-60" />
    </div>
  );
}

/**
 * The signed URL of the stored bytes (1h), only for files that have them. `reload` signs a
 * fresh one (an expired URL is the usual reason a viewer fails to fetch); `attempt` counts
 * reloads so viewers can remount on it.
 */
function useContentUrl(fileId: FileId, enabled: boolean) {
  const api = useApi();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    fileId?: FileId;
    attempt?: number;
    data?: FileContentUrl;
    error?: unknown;
  }>({});
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    call(api, (client) => client["library.getFileContentUrl"]({ fileId }))
      .then((data) => active && setState({ fileId, attempt, data }))
      .catch((error: unknown) => active && setState({ fileId, attempt, error }));
    return () => {
      active = false;
    };
  }, [api, fileId, enabled, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const current = enabled && state.fileId === fileId && state.attempt === attempt;
  return { ...(current ? state : {}), attempt, reload };
}

/** Same as SourceViewer, for callers that already have the file. */
export function SourceViewerBody({
  file,
  page,
  t,
  region,
  q,
  compact = false,
  showIdentity = compact,
}: Omit<SourceViewerProps, "fileId"> & {
  readonly file: LibraryFile;
  readonly showIdentity?: boolean;
}) {
  const api = useApi();
  const files = useMemo(() => [file], [file]);
  const { jobs, retry } = useIngestionJobs(files);
  const state = ingestionState(jobs.get(file.id), file);
  const stored = file.storageKey !== null;
  const content = useContentUrl(file.id, stored);
  const url = content.data?.url;
  const mimeType = content.data?.mimeType ?? file.mimeType;
  // Keyed by file so moving between sources never carries a previous file's failure along.
  const [fallbackFor, setFallbackFor] = useState<FileId | null>(null);
  const [pdfFailure, setPdfFailure] = useState<{
    fileId: FileId;
    attempt: number;
    message: string;
  } | null>(null);
  const fallback = fallbackFor === file.id;
  const pdfError =
    pdfFailure?.fileId === file.id && pdfFailure.attempt === content.attempt
      ? pdfFailure.message
      : null;
  const setPdfError = useCallback(
    (message: string) => setPdfFailure({ fileId: file.id, attempt: content.attempt, message }),
    [file.id, content.attempt],
  );
  const reloadContent = content.reload;

  useEffect(() => {
    void call(api, (client) =>
      client["library.recordFileEvent"]({ fileId: file.id, kind: "opened" }),
    ).catch(() => {});
  }, [api, file.id]);

  const desktop = useIsDesktop();
  const reopen = useReopenFile();
  // The stored bytes stand in for the original when there is nothing else to reopen.
  const openOriginal = useMemo(
    () => (hasOriginal(file, desktop) || url ? () => reopen(file, url) : null),
    [file, desktop, url, reopen],
  );
  const youtube = youtubeId(file.sourceUrl);
  const waitingForUrl = stored && !content.data && !content.error;
  const urlError = stored && content.error ? content.error : null;
  // Remount viewers on a retry so they fetch the freshly signed URL from scratch.
  const viewKey = `${file.id}:${content.attempt}`;

  const office = stored ? officeType(file.title, mimeType) : null;
  // PDFs and office files bring their own scroller and dock: in a pane they fill the height,
  // already while the URL is signed so the loading frame never collapses first.
  const framed = !urlError && ((file.kind === "pdf" && stored && !pdfError) || !!office);
  // On its own page a PDF is the whole stage under the header (v1's document canvas).
  const stage = !compact && file.kind === "pdf";
  let body: React.ReactNode;
  if (waitingForUrl)
    body = framed ? (
      <ViewerLoading label={file.kind === "pdf" ? "Loading PDF" : "Loading document"} />
    ) : (
      <BodySkeleton kind={file.kind} compact={compact} />
    );
  else if (urlError)
    body = (
      <div className={cn(compact && "px-5")}>
        <ErrorRow error={urlError} onRetry={reloadContent} />
      </div>
    );
  else if (file.kind === "pdf" && url && !pdfError)
    body = (
      <PdfView key={viewKey} url={url} page={page} q={q} compact={compact} onError={setPdfError} />
    );
  else if ((file.kind === "video" || file.kind === "audio") && url)
    body = (
      <MediaView
        key={file.id}
        url={url}
        kind={file.kind}
        t={t}
        capturedAt={file.mediaPositionSec}
        compact={compact}
      />
    );
  else if (youtube)
    body = (
      <YouTubeView
        id={youtube}
        title={file.title}
        t={t ?? file.mediaPositionSec ?? undefined}
        compact={compact}
      />
    );
  else if (file.kind === "image" && url)
    body = (
      <div className="flex flex-col gap-3">
        <ImageView key={file.id} url={url} alt={file.title} region={region} compact={compact} />
        <div className={cn("flex flex-col gap-3", compact ? "px-5" : "px-1")}>
          {region ? (
            <span>
              <CitedChip>Cited in Ava's answer</CitedChip>
            </span>
          ) : null}
          {file.preview ? (
            <Aside label="Read from the image" footer={<CapturedLine file={file} />}>
              {file.preview}
            </Aside>
          ) : null}
        </div>
      </div>
    );
  else if (url && office)
    body = (
      <OfficeView
        key={viewKey}
        url={url}
        type={office}
        compact={compact}
        q={q}
        page={page}
        onRetry={reloadContent}
      />
    );
  else if (url && isReadableText(mimeType) && !fallback)
    body = (
      <TextView
        key={file.id}
        url={url}
        mimeType={mimeType!}
        q={q}
        compact={compact}
        onUnavailable={() => setFallbackFor(file.id)}
      />
    );
  else
    body = (
      <SourceCardFallback
        file={file}
        onOpenOriginal={openOriginal}
        compact={compact}
        showIdentity={showIdentity}
      />
    );

  // Rows above a full-bleed stage line up with the header's gutters instead of a column's.
  const gutter = compact ? "px-5" : stage ? "px-4 md:px-6" : null;
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col",
        compact ? "gap-3" : stage ? "gap-2" : "gap-4",
        (compact || stage) && framed && "h-full min-h-0 flex-1",
      )}
    >
      {/* Compact panes always keep this row, so "Open original" arriving with the signed URL
          doesn't push the frame down. */}
      {framed && (page || q || compact) ? (
        <div className={cn("flex min-h-8 shrink-0 items-center gap-2", gutter)}>
          {page || q ? <CitedChip>Cited in Ava's answer</CitedChip> : null}
          <span className="flex-1" />
          {compact && openOriginal ? <OpenOriginal onClick={openOriginal} /> : null}
        </div>
      ) : null}

      {/* A PDF that wouldn't render retries with a freshly signed URL, not a re-ingest. */}
      {state || pdfError ? (
        <div
          className={cn(
            "shrink-0",
            gutter,
            stage && !framed && "mx-auto w-full max-w-[944px] pt-6 md:px-8",
          )}
        >
          <StateNotice
            file={file}
            state={pdfError ? { kind: "failed", reason: pdfError } : state!}
            onRetry={pdfError ? reloadContent : () => void retry(file.id)}
            onOpenOriginal={openOriginal}
          />
        </div>
      ) : null}

      <div
        className={cn(
          framed && "-mx-4 overflow-hidden bg-surface-3 md:mx-0 md:rounded-[10px]",
          framed &&
            (compact || stage) &&
            "mx-0 flex min-h-0 flex-1 flex-col rounded-none md:mx-0 md:rounded-none",
          // A PDF that couldn't be shown falls back to the card, centred like any page column.
          stage && !framed && "mx-auto w-full max-w-[944px] px-4 pt-6 md:px-8",
        )}
      >
        <OpenOriginalContext.Provider value={openOriginal}>{body}</OpenOriginalContext.Provider>
      </div>

      {compact && openOriginal && !framed ? (
        <div className="flex justify-end px-5 pb-2">
          <OpenOriginal onClick={openOriginal} />
        </div>
      ) : null}
    </div>
  );
}

export function OpenOriginal({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1 text-[13px] whitespace-nowrap text-foreground-soft transition-colors hover:text-foreground",
        className,
      )}
    >
      Open original
      <ArrowUpRight className="size-3.5" aria-hidden="true" />
    </button>
  );
}

function CapturedLine({ file }: { file: LibraryFile }) {
  const { folderById } = useLibrary();
  const folder = file.folderIds.map((id) => folderById.get(id)).find(Boolean);
  return (
    <>
      captured <RelativeTime iso={file.createdAt} format="day" className="text-xs lowercase" /> ·{" "}
      {folder?.name ?? (file.placement === "inbox" ? "Unfiled" : "")}
    </>
  );
}

/** Processing, failed, password, paywall and login states (20), as a flat aside. */
function StateNotice({
  file,
  state,
  onRetry,
  onOpenOriginal,
}: {
  file: LibraryFile;
  state: IngestionState;
  onRetry: () => void;
  onOpenOriginal: (() => void) | null;
}) {
  const [kept, setKept] = useState(false);
  if (kept) return null;
  // Logging in on the original and capturing it again replaces this stub.
  const open = onOpenOriginal ? { label: "Open original", run: onOpenOriginal } : undefined;
  const copy = (() => {
    switch (state.kind) {
      case "processing":
        return {
          text: `${state.label}… Search and citations work once Ava has read it.`,
          tone: "text-foreground-soft",
          rule: "border-input",
        };
      case "paused":
        return {
          text: "Paused. Ava won't read it until you resume.",
          tone: "text-foreground-soft",
          rule: "border-input",
          action: { label: "Resume", run: onRetry },
        };
      case "password":
        return {
          text: "Couldn't open it. The file is password-protected.",
          tone: "text-destructive/85",
          rule: "border-destructive-line",
          action: { label: "Try again", run: onRetry },
        };
      case "paywall":
        return {
          text: "Behind a paywall. Saved the title and abstract only.",
          tone: "text-warning",
          rule: "border-warning/50",
          action: open,
          secondary: { label: "Keep", run: () => (keepSource(file.id), setKept(true)) },
        };
      case "login":
        return {
          text: `Needs your ${state.site ?? "site"} login. Capture it again on your computer with logged-in capture on.`,
          tone: "text-warning",
          rule: "border-warning/50",
          action: open,
        };
      case "failed":
        return {
          text: `Couldn't read it. ${state.reason}`,
          tone: "text-destructive/85",
          rule: "border-destructive-line",
          action: { label: "Try again", run: onRetry },
        };
    }
  })();
  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-l-2 py-0.5 pl-3 md:flex-row md:items-center md:gap-4",
        copy.rule,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className={cn("text-[13.5px] leading-5", copy.tone)}>{copy.text}</span>
        {state.kind === "processing" ? (
          <span className="relative block h-0.5 w-full max-w-[420px] overflow-hidden rounded-full bg-border">
            <span className="animate-sweep absolute inset-y-0 left-0 w-2/5 rounded-full bg-foreground/80" />
          </span>
        ) : null}
      </div>
      {"action" in copy && copy.action ? (
        <span className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" className="max-md:h-10" onClick={copy.action.run}>
            {copy.action.label}
          </Button>
          {"secondary" in copy && copy.secondary ? (
            <Button variant="ghost" className="max-md:h-10" onClick={copy.secondary.run}>
              {copy.secondary.label}
            </Button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

/** Nothing to render inline: title, address, what we know, and the way out. */
function SourceCardFallback({
  file,
  onOpenOriginal,
  compact,
  showIdentity = compact,
}: {
  file: LibraryFile;
  onOpenOriginal: (() => void) | null;
  compact: boolean;
  showIdentity?: boolean;
}) {
  const meta = [originLabel(file), savedOn(file)].filter(Boolean).join(" · ");
  return (
    <div
      className={cn("flex flex-col gap-4 border-y border-border py-6 md:py-8", compact && "mx-5")}
    >
      {showIdentity ? (
        <div className="flex items-start gap-3">
          <FileKindIcon kind={file.kind} url={file.sourceUrl} size={20} className="mt-0.5" />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[16px] leading-[22px] font-semibold md:text-[15px]">
              {file.title}
            </span>
            {meta ? (
              <span className="truncate text-[13px] text-muted-foreground">{meta}</span>
            ) : null}
          </div>
        </div>
      ) : null}
      {file.preview ? (
        <p className="text-[14px] leading-[22px] text-foreground-soft md:text-[13.5px]">
          {file.preview}
        </p>
      ) : null}
      {onOpenOriginal ? (
        <button
          type="button"
          onClick={onOpenOriginal}
          className="motion-press inline-flex h-11 w-fit items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[15px] font-medium text-primary-foreground md:h-8 md:px-3 md:text-[13px]"
        >
          Open original
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </button>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          There's nothing more to show for this source yet.
        </p>
      )}
    </div>
  );
}

function BodySkeleton({ kind, compact }: { kind: LibraryFile["kind"]; compact: boolean }) {
  if (kind === "video" || kind === "image")
    return (
      <Skeleton className={cn("aspect-video w-full rounded-[10px]", compact && "mx-4 w-auto")} />
    );
  return (
    <div className={cn("flex flex-col gap-3.5", compact && "px-5")}>
      {["90%", "100%", "80%", "50%"].map((width, index) => (
        <Skeleton key={index} className="h-3" style={{ width }} />
      ))}
    </div>
  );
}
