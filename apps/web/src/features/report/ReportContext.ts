"use client";

import type { FileId } from "@avenire/contracts";
import { createContext, useContext } from "react";

import { parseCitation, type CitationTarget } from "~/features/sources/citation";

export interface CitationRequest {
  readonly fileId: FileId;
  readonly target: CitationTarget;
  readonly title?: string | undefined;
}

export interface ReportActions {
  /** Open a cited source in the pane (desktop) or a half sheet (phone); never navigates. */
  readonly openCitation: (request: CitationRequest) => void;
  /** Send a follow-up to Ruth from a pane button ("Ask Ruth about what I missed"). */
  readonly askRuth: (text: string) => void;
  readonly runId: string;
}

export const ReportContext = createContext<ReportActions>({
  openCitation: () => {},
  askRuth: () => {},
  runId: "",
});

export const useReport = () => useContext(ReportContext);

/**
 * Citation chips are `<a class="ruth-cite" href="/sources/<id>?page=…">`. The report catches
 * their clicks (capture phase, so chips anywhere in the thread or pane work) and opens them in
 * place; modified clicks still open the source page.
 */
export function citationFromClick(event: React.MouseEvent): CitationRequest | null {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return null;
  const anchor = (event.target as HTMLElement | null)?.closest?.("a.ruth-cite");
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  const url = new URL(anchor.href, window.location.origin);
  const match = /^\/sources\/([^/]+)$/.exec(url.pathname);
  if (!match) return null;
  event.preventDefault();
  event.stopPropagation();
  return {
    fileId: decodeURIComponent(match[1]!) as FileId,
    target: parseCitation(url.searchParams),
    title: anchor.title || undefined,
  };
}

/** "/sources/<id>?page=4" for a citation, for "Open original" style links. */
export function sourceHref({ fileId, target }: CitationRequest): string {
  const params = new URLSearchParams();
  if (target.page) params.set("page", String(target.page));
  if (target.t !== undefined) params.set("t", String(Math.floor(target.t)));
  const query = params.toString();
  return `/sources/${encodeURIComponent(fileId)}${query ? `?${query}` : ""}`;
}
