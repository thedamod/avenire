"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@avenire/ui/lib/utils";
import { formatTimestamp } from "~/lib/time";
import { CitedChip } from "./parts";

/**
 * Video or audio from the stored file (14b / M19). Opens at `t` (the cited moment); under it a
 * slim track marks the cited moment (white) and where the user captured it (orange).
 */
export function MediaView({
  url,
  kind,
  t,
  capturedAt,
  compact,
}: {
  url: string;
  kind: "video" | "audio";
  t: number | undefined;
  capturedAt: number | null;
  compact: boolean;
}) {
  const media = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const node = media.current;
    if (!node || t === undefined) return;
    if (node.readyState >= 1) node.currentTime = t;
  }, [t]);

  const seek = (seconds: number) => {
    const node = media.current;
    if (!node) return;
    node.currentTime = seconds;
    void node.play().catch(() => {});
  };

  const Tag = kind === "video" ? "video" : "audio";
  return (
    <div className={cn("flex flex-col gap-2.5", compact ? "px-4 pt-1" : "")}>
      <Tag
        ref={media}
        src={url}
        controls
        playsInline
        preload="metadata"
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration || 0);
          if (t !== undefined) event.currentTarget.currentTime = t;
        }}
        className={cn(
          "w-full bg-surface-3",
          kind === "video" ? "aspect-video rounded-[10px]" : "h-12 rounded-lg",
        )}
      />
      {duration > 0 && (t !== undefined || capturedAt) ? (
        <div className="relative mx-1 h-[3px] rounded-full bg-white/15" aria-hidden="true">
          {t !== undefined ? (
            <Mark
              at={t / duration}
              className="-top-[5px] h-[13px] bg-foreground"
              onClick={() => seek(t)}
            />
          ) : null}
          {capturedAt ? (
            <Mark
              at={capturedAt / duration}
              className="-top-[3px] h-[9px] bg-warning"
              onClick={() => seek(capturedAt)}
            />
          ) : null}
        </div>
      ) : null}
      <div className="flex min-w-0 flex-wrap items-center gap-2 px-1">
        {t !== undefined ? (
          <button type="button" onClick={() => seek(t)}>
            <CitedChip>Cited · {formatTimestamp(t)}</CitedChip>
          </button>
        ) : null}
        {capturedAt ? (
          <button
            type="button"
            onClick={() => seek(capturedAt)}
            className="truncate text-xs text-muted-foreground hover:text-foreground"
          >
            {t !== undefined
              ? "orange mark: where you captured it"
              : `You captured it at ${formatTimestamp(capturedAt)}`}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Mark({ at, className, onClick }: { at: number; className: string; onClick: () => void }) {
  return (
    <span
      onClick={onClick}
      className={cn("absolute w-0.5 cursor-pointer rounded-[1px]", className)}
      style={{ left: `${Math.min(100, Math.max(0, at * 100))}%` }}
    />
  );
}

/** A YouTube source saved without a file: the privacy-enhanced embed, starting at `t`. */
export function YouTubeView({
  id,
  title,
  t,
  compact,
}: {
  id: string;
  title: string;
  t: number | undefined;
  compact: boolean;
}) {
  const params = new URLSearchParams({ rel: "0", modestbranding: "1" });
  if (t !== undefined) params.set("start", String(Math.floor(t)));
  return (
    <div className={cn("flex flex-col gap-2.5", compact ? "px-4 pt-1" : "")}>
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?${params.toString()}`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        referrerPolicy="strict-origin-when-cross-origin"
        className="aspect-video w-full rounded-[10px] border-0 bg-surface-3"
      />
      {t !== undefined ? (
        <div className="px-1">
          <CitedChip>Cited · {formatTimestamp(t)}</CitedChip>
        </div>
      ) : null}
    </div>
  );
}
