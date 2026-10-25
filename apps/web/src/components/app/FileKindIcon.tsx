"use client";

import { memo, useState } from "react";
import type { FileKind } from "@avenire/contracts";
import {
  AudioLines,
  FileText,
  Globe,
  Image as ImageIcon,
  NotebookText,
  SquarePlay,
  TextQuote,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@avenire/ui/lib/utils";

const KIND_ICONS: Record<FileKind, LucideIcon> = {
  pdf: FileText,
  document: FileText,
  "web-page": Globe,
  video: SquarePlay,
  audio: AudioLines,
  image: ImageIcon,
  note: NotebookText,
  selection: TextQuote,
};

export const KIND_LABELS: Record<FileKind, string> = {
  pdf: "PDF",
  document: "Document",
  "web-page": "Web page",
  video: "Video",
  audio: "Audio",
  image: "Image",
  note: "Note",
  selection: "Selection",
};

export function kindIcon(kind: FileKind): LucideIcon {
  return KIND_ICONS[kind];
}

/** Host of an http(s) URL, without `www.`; null for anything else. */
export function urlHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Neutral line icon per file kind. Sources captured from the web (pages, videos, PDFs with a
 * URL) show the site's favicon instead, falling back to the icon if it doesn't load.
 * `tile` wraps it in the 34px bordered square used in phone rows.
 */
export const FileKindIcon = memo(function FileKindIcon({
  kind,
  url,
  size = 16,
  tile = false,
  className,
}: {
  kind: FileKind;
  url?: string | null;
  size?: number;
  tile?: boolean;
  className?: string;
}) {
  const host = kind === "note" ? null : urlHost(url);
  const [failed, setFailed] = useState(false);
  const Icon = KIND_ICONS[kind];
  const glyph =
    host && !failed ? (
      <img
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="shrink-0 rounded-[3px]"
        style={{ width: size, height: size }}
      />
    ) : (
      <Icon
        aria-hidden="true"
        strokeWidth={1.5}
        className="shrink-0 text-foreground-soft"
        style={{ width: size, height: size }}
      />
    );
  if (!tile) return <span className={cn("inline-flex shrink-0", className)}>{glyph}</span>;
  return (
    <span
      className={cn(
        "inline-flex size-[34px] shrink-0 items-center justify-center rounded-lg border border-border bg-surface-3",
        className,
      )}
    >
      {glyph}
    </span>
  );
});
