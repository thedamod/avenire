"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DocxEditorViewer, useDocxEditor, type DocxEditorController } from "@extend-ai/react-docx";
import { ReadableDocument } from "./ReadableDocument";
import { ViewerDock, useScrollActivatedDock } from "./ViewerDock";
import { OfficeFailure, OfficeLoading, type OfficeViewProps } from "./office-shared";
import { ZOOM_RANGE, clampZoom } from "./viewer-logic";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
// Pages are ~816px wide, so phones need to go below the office minimum to fit one.
const RANGE = { ...ZOOM_RANGE.office, min: 0.25 };

/** Scroll page `n` (1-based) to the top of the viewer's own scroller. */
function revealPage(viewport: HTMLElement | null, n: number, total: number, smooth: boolean) {
  if (!viewport) return;
  const index = Math.max(0, Math.min(total - 1, n - 1));
  const behavior = smooth ? "smooth" : "auto";
  const exact = () => {
    const page = viewport.querySelector<HTMLElement>(`[data-docx-page-index="${index}"]`);
    if (!page) return false;
    const top =
      page.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop;
    viewport.scrollTo({ top: Math.max(0, top - 12), behavior });
    return true;
  };
  if (exact()) return;
  // Offscreen pages are virtualised placeholders: jump to the estimate, then settle on the page
  // once the virtualiser has mounted it.
  viewport.scrollTo({
    top: (index / Math.max(1, total)) * viewport.scrollHeight,
    behavior: "auto",
  });
  let tries = 0;
  const settle = () => {
    if (exact() || ++tries > 8) return;
    requestAnimationFrame(settle);
  };
  requestAnimationFrame(settle);
}

/**
 * A Word document laid out as real pages by react-docx (read-only), like v1's viewer: the dock
 * pages and zooms it, and a citation opens at its page and/or marks the cited passage.
 */
export default function OfficeDocx({
  url,
  name,
  q,
  page,
  compact,
  target,
  onRetry,
}: OfficeViewProps) {
  const editor = useDocxEditor();
  const viewport = useRef<HTMLDivElement | null>(null);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const importDocx = useRef<DocxEditorController["importDocxFile"]>(editor.importDocxFile);
  const [zoom, setZoom] = useState(1);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ url: string; message: string } | null>(null);
  useEffect(() => {
    importDocx.current = editor.importDocxFile;
  }, [editor.importDocxFile]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Unable to load document (${response.status})`);
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      await importDocx.current(new File([blob], name, { type: blob.type || DOCX_MIME }));
      if (!controller.signal.aborted) setLoaded(url);
    })().catch((cause: unknown) => {
      if (!controller.signal.aborted)
        setFailure({
          url,
          message: cause instanceof Error ? cause.message : "Unable to preview document",
        });
    });
    return () => controller.abort();
  }, [url, name]);

  const failed =
    failure?.url === url ? failure.message : editor.importError ? editor.importError.message : null;
  const ready = loaded === url && !editor.isImporting && !failed;
  // The viewer reports its page count; the page in view is read from its page wrappers.
  const [pageCount, setPageCount] = useState(0);
  const [inView, setInView] = useState(1);
  const total = Math.max(1, pageCount);
  const current = Math.max(1, Math.min(total, inView));
  useEffect(() => {
    const node = scroller;
    if (!node || !ready) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const line = node.getBoundingClientRect().top + node.clientHeight / 3;
        for (const page of node.querySelectorAll<HTMLElement>("[data-docx-page-index]")) {
          const rect = page.getBoundingClientRect();
          if (rect.top <= line && rect.bottom > line) {
            setInView(Number(page.dataset.docxPageIndex) + 1);
            return;
          }
        }
      });
    };
    update();
    node.addEventListener("scroll", update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      node.removeEventListener("scroll", update);
    };
  }, [scroller, ready, zoom]);
  const dockVisible = useScrollActivatedDock(viewport, ready, target);
  const go = useCallback(
    (n: number, smooth = true) => revealPage(viewport.current, n, total, smooth),
    [total],
  );

  // Page width at 100%, from a mounted page (the viewer's CSS zoom scales its box).
  const fitWidth = useCallback(() => {
    const node = viewport.current;
    const first = node?.querySelector<HTMLElement>("[data-docx-page-index]");
    if (!node || !first) return;
    const width = first.getBoundingClientRect().width / zoom;
    const room = node.clientWidth - 24;
    if (width > 0) setZoom(clampZoom(Math.floor((room / width) * 100) / 100, RANGE.min, RANGE.max));
  }, [zoom]);
  // A page wider than the pane (phones, narrow sheets) opens fitted to its width.
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    const node = viewport.current;
    if (!ready || !node || pageCount < 1 || fitted.current === url) return;
    fitted.current = url;
    const first = node.querySelector<HTMLElement>("[data-docx-page-index]");
    if (first && first.getBoundingClientRect().width > node.clientWidth - 24) fitWidth();
  }, [ready, pageCount, url, fitWidth]);

  // Open at the cited page once the document has paginated far enough to have it.
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !page) return;
    const key = `${url}#${page}`;
    if (opened.current === key || pageCount < Math.min(page, 2)) return;
    opened.current = key;
    requestAnimationFrame(() => go(page, false));
  }, [ready, page, url, pageCount, go]);

  // Without a page, a cited passage is found by ReadableDocument, so every page stays mounted.
  const locate = Boolean(q?.trim()) && !page;

  return (
    <>
      <div
        ref={(node) => {
          viewport.current = node;
          setScroller(node);
        }}
        className="min-h-0 flex-1 overflow-auto overscroll-contain bg-surface-3 px-3 pt-3 pb-24"
      >
        {failed ? (
          <OfficeFailure message={failed} url={url} onRetry={onRetry} />
        ) : !ready ? (
          <OfficeLoading />
        ) : null}
        <div hidden={!ready} style={{ zoom }}>
          <ReadableDocument bare q={q} {...(locate ? { scrollRoot: viewport } : {})}>
            <DocxEditorViewer
              editor={editor}
              mode="read-only"
              className="mx-auto"
              pageGapBackgroundColor="transparent"
              onPageCountChange={setPageCount}
              pageVirtualization={{
                enabled: !locate,
                overscan: 2,
                scrollElement: scroller,
                zoomScale: zoom,
              }}
            />
          </ReadableDocument>
        </div>
      </div>
      <ViewerDock
        zoom={zoom}
        range={RANGE}
        onZoom={setZoom}
        onReset={() => setZoom(1)}
        onFitWidth={fitWidth}
        paging={ready ? { current, total, onPage: go } : undefined}
        compact={compact}
        url={url}
        target={target}
        visible={dockVisible}
      />
    </>
  );
}
