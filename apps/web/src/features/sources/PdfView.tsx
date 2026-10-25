"use client";
import "react-pdf/dist/Page/TextLayer.css";
import "./viewer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { cn } from "@avenire/ui/lib/utils";
import { ViewerDock, useScrollActivatedDock } from "./ViewerDock";
import { ViewerLoading } from "./ViewerLoading";
import {
  ZOOM_RANGE,
  type ItemRanges,
  citationQueries,
  clampZoom,
  findInItems,
  markRanges,
  safePixelRatio,
  stepZoom,
} from "./viewer-logic";
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const RANGE = ZOOM_RANGE.pdf;
/** PDF points → CSS px, so 100% matches PDF.js and the page's printed size. */
const CSS_UNITS = 96 / 72;
const PAD = 16;
/** Height the floating dock covers at the bottom; Fit page keeps the page clear of it. */
const DOCK_RESERVE = 64;
const LETTER = { w: 612 * CSS_UNITS, h: 792 * CSS_UNITS };

type Size = { w: number; h: number };
type Fit = "width" | "page" | null;
/** Where the reader is looking: a point inside a page, and where it sits in the viewport. */
type Anchor = { page: number; fx: number; fy: number; vx: number; vy: number };

/**
 * Every page of a PDF in one scroller, rendered near the viewport. Opens at `page`
 * (briefly outlined) and marks the cited passage `q`, jumping to it when no page is given.
 * Always fills its parent: the source page's full-height stage, or (`compact`) a pane, sheet
 * or the mobile embed, where the dock keeps only paging and zoom.
 */
export default function PdfView({
  url,
  page,
  q,
  compact,
  onError,
}: {
  url: string;
  page?: number | undefined;
  q?: string | undefined;
  compact: boolean;
  onError: (message: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  // react-pdf can commit our onLoadSuccess before it renders its children, so effects that need
  // the scroller and page nodes key on the scroller actually mounting, not just on `count`.
  const [scrollerNode, setScrollerNode] = useState<HTMLDivElement | null>(null);
  const attachScroller = useCallback((node: HTMLDivElement | null) => {
    scroller.current = node;
    setScrollerNode(node);
  }, []);
  const content = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<number, HTMLDivElement>());
  const anchor = useRef<Anchor | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [box, setBox] = useState({ w: 600, h: 700 });
  const [sizes, setSizes] = useState<Size[]>([]);
  const [sizesReady, setSizesReady] = useState(false);
  const [fit, setFit] = useState<Fit>("width");
  const [custom, setCustom] = useState(1);
  const [near, setNear] = useState(() => new Set([page ?? 1]));
  const [current, setCurrent] = useState(page ?? 1);
  const [flash, setFlash] = useState<number | null>(null);
  const [marks, setMarks] = useState(() => new Map<number, ItemRanges>());
  const [rail, setRail] = useState(false);
  const [invert, setInvert] = useState(true);
  const count = pdf?.numPages ?? 0;
  const dockVisible = useScrollActivatedDock(scroller, count > 0 && !!scrollerNode, container);

  // A new file (or a refreshed signed URL) starts clean instead of showing stale pages.
  const [loadedUrl, setLoadedUrl] = useState(url);
  if (loadedUrl !== url) {
    setLoadedUrl(url);
    setPdf(null);
    setSizes([]);
    setSizesReady(false);
    setMarks(new Map());
    setInvert(true);
  }

  // First guess from the container (present from the start) so the first pages render near size.
  useLayoutEffect(() => {
    const node = container.current;
    if (node?.clientWidth)
      setBox({ w: Math.max(120, node.clientWidth - PAD * 2), h: node.clientHeight });
  }, []);
  // The scroller only exists once react-pdf has loaded the document, so measure from then on;
  // the observer also catches the thumbnail rail opening and pane/sheet resizes.
  useEffect(() => {
    const node = scroller.current;
    if (!node || !count) return;
    const measure = () =>
      setBox({ w: Math.max(120, node.clientWidth - PAD * 2), h: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [count, scrollerNode]);

  const sizeOf = useCallback((n: number) => sizes[n - 1] ?? sizes[0] ?? LETTER, [sizes]);
  const widest = useMemo(() => Math.max(...sizes.map((s) => s.w), sizeOf(1).w), [sizes, sizeOf]);
  const zoom = clampZoom(
    fit === "width"
      ? box.w / widest
      : fit === "page"
        ? Math.min(box.w / sizeOf(current).w, (box.h - PAD * 2 - DOCK_RESERVE) / sizeOf(current).h)
        : custom,
    RANGE.min,
    RANGE.max,
  );

  // Page sizes up front so placeholders hold their space and jumps land where they should.
  useEffect(() => {
    if (!pdf) return;
    let active = true;
    void (async () => {
      const read = async (n: number) => {
        const v = (await pdf.getPage(n)).getViewport({ scale: CSS_UNITS });
        return { w: v.width, h: v.height };
      };
      const first = await read(1);
      if (!active) return;
      setSizes(Array.from({ length: pdf.numPages }, () => first));
      const all: Size[] = [first];
      for (let n = 2; n <= pdf.numPages && active; n += 32) {
        const batch = Array.from({ length: Math.min(32, pdf.numPages - n + 1) }, (_, i) => n + i);
        all.push(...(await Promise.all(batch.map(read))));
      }
      if (active) {
        setSizes(all);
        setSizesReady(true);
      }
    })().catch(() => active && setSizesReady(true));
    return () => {
      active = false;
    };
  }, [pdf]);

  const capture = useCallback((vx: number, vy: number): Anchor | null => {
    const node = scroller.current;
    if (!node || !nodes.current.size) return null;
    const y = node.scrollTop + vy;
    let hit: [number, HTMLDivElement] | null = null;
    for (const entry of nodes.current) {
      if (!hit || entry[1].offsetTop <= y) hit = entry;
      if (entry[1].offsetTop + entry[1].offsetHeight > y) break;
    }
    if (!hit) return null;
    const [n, el] = hit;
    return {
      page: n,
      fx: (node.scrollLeft + vx - el.offsetLeft) / el.offsetWidth,
      fy: Math.min(1, Math.max(0, (y - el.offsetTop) / el.offsetHeight)),
      vx,
      vy,
    };
  }, []);

  const scrollToPage = useCallback((n: number, smooth = false) => {
    const node = scroller.current;
    const el = nodes.current.get(n);
    if (!node || !el) return;
    node.scrollTo({ top: el.offsetTop - PAD, behavior: smooth ? "smooth" : "auto" });
    anchor.current = { page: n, fx: 0.5, fy: 0, vx: node.clientWidth / 2, vy: PAD };
    setCurrent(n);
  }, []);

  /** Previous/next and the page field: smooth for neighbours, instant across the document. */
  const goTo = useCallback(
    (n: number) => {
      const target = Math.max(1, Math.min(count, n));
      scrollToPage(target, Math.abs(target - current) <= 2);
    },
    [count, current, scrollToPage],
  );

  // Keep the anchored point still whenever the rendered zoom changes (buttons, pinch, fit, resize).
  const previousZoom = useRef(zoom);
  useLayoutEffect(() => {
    if (previousZoom.current === zoom) return;
    previousZoom.current = zoom;
    const node = scroller.current;
    const a = anchor.current;
    const el = a && nodes.current.get(a.page);
    if (!node || !a || !el) return;
    node.scrollTop = el.offsetTop + a.fy * el.offsetHeight - a.vy;
    node.scrollLeft = el.offsetLeft + a.fx * el.offsetWidth - a.vx;
  }, [zoom]);

  const changeZoom = useCallback(
    (value: number, focal?: { x: number; y: number }) => {
      const node = scroller.current;
      if (node)
        anchor.current =
          capture(focal?.x ?? node.clientWidth / 2, focal?.y ?? node.clientHeight / 2) ??
          anchor.current;
      setFit(null);
      setCustom(clampZoom(value, RANGE.min, RANGE.max));
    },
    [capture],
  );
  const changeFit = useCallback(
    (next: Fit) => {
      const node = scroller.current;
      if (!node) return setFit(next);
      if (next === "page") {
        // The whole current page, its top just under the padding (never half scrolled off).
        anchor.current = { page: current, fx: 0.5, fy: 0, vx: node.clientWidth / 2, vy: PAD };
        setFit(next);
        // Also when the zoom doesn't change, so the anchoring effect doesn't run.
        requestAnimationFrame(() => scrollToPage(current));
        return;
      }
      // Fit width keeps the reader's place: the line at the top stays at the top.
      anchor.current = capture(node.clientWidth / 2, PAD) ?? anchor.current;
      setFit(next);
    },
    [capture, current, scrollToPage],
  );

  // Current page and the zoom anchor follow the scroll position (centre of the viewport).
  useEffect(() => {
    const node = scroller.current;
    if (!node || !count) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const a = capture(node.clientWidth / 2, node.clientHeight / 2);
        if (!a) return;
        anchor.current = a;
        setCurrent(a.page);
      });
    };
    node.addEventListener("scroll", update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      node.removeEventListener("scroll", update);
    };
  }, [count, capture, scrollerNode]);

  // Render only pages within about a screen of the viewport, at any zoom.
  useEffect(() => {
    if (!count) return;
    const observer = new IntersectionObserver(
      (entries) =>
        setNear((previous) => {
          const next = new Set(previous);
          for (const entry of entries) {
            const n = Number((entry.target as HTMLElement).dataset.page);
            if (entry.isIntersecting) next.add(n);
            else next.delete(n);
          }
          return next;
        }),
      { root: scroller.current, rootMargin: "100% 0px" },
    );
    for (const node of nodes.current.values()) observer.observe(node);
    return () => observer.disconnect();
  }, [count, scrollerNode]);

  // Citation page: jump once the layout is real, outline it for a moment.
  useEffect(() => {
    if (!count || !sizesReady || !page || !scrollerNode) return;
    const target = Math.max(1, Math.min(count, page));
    scrollToPage(target);
    setFlash(target);
    const timer = window.setTimeout(() => setFlash(null), 2400);
    return () => window.clearTimeout(timer);
  }, [count, sizesReady, page, scrollToPage, scrollerNode]);

  // Cited passage: match across text items (PDF.js splits lines and words), falling back to
  // shorter prefixes of a long quote. Prefer the cited page; otherwise jump to the first hit.
  useEffect(() => {
    setMarks(new Map());
    const queries = citationQueries(q ?? "");
    if (!pdf || !sizesReady || !queries.length) return;
    let active = true;
    const texts = new Map<number, string[]>();
    const text = async (n: number) => {
      if (!texts.has(n)) {
        const items = (await (await pdf.getPage(n)).getTextContent()).items;
        texts.set(
          n,
          items.map((item) => ("str" in item ? item.str : "")),
        );
      }
      return texts.get(n)!;
    };
    void (async () => {
      const cited = page && page <= pdf.numPages ? page : null;
      if (cited) {
        const items = await text(cited);
        for (const needle of queries) {
          const ranges = findInItems(items, needle);
          if (ranges) {
            if (active) setMarks(new Map([[cited, ranges]]));
            return;
          }
        }
      }
      for (let n = 1; n <= pdf.numPages && active; n++) await text(n);
      for (const needle of queries) {
        const found = new Map<number, ItemRanges>();
        for (const [n, items] of texts) {
          const ranges = findInItems(items, needle);
          if (ranges) found.set(n, ranges);
        }
        if (!found.size) continue;
        if (!active) return;
        setMarks(found);
        const first = Math.min(...found.keys());
        if (!cited) {
          scrollToPage(first);
          setFlash(first);
          window.setTimeout(() => active && setFlash(null), 2400);
        }
        return;
      }
    })().catch(() => {});
    return () => {
      active = false;
    };
  }, [pdf, sizesReady, q, page, scrollToPage]);

  // Cmd/Ctrl + / - / 0 zoom inside the viewer without zooming the whole app.
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const key = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "0") {
        e.preventDefault();
        changeFit("width");
      } else if (["+", "=", "-"].includes(e.key)) {
        e.preventDefault();
        changeZoom(stepZoom(zoom, e.key === "-" ? -1 : 1, RANGE));
      }
    };
    node.addEventListener("keydown", key);
    return () => node.removeEventListener("keydown", key);
  }, [zoom, changeZoom, changeFit]);

  // Pinch and ctrl/trackpad wheel preview with a transform around the focal point, then commit
  // one crisp render on release. A cancelled touch (incoming call, system gesture) reverts.
  useEffect(() => {
    const node = scroller.current;
    if (!node || !count) return;
    let gesture: { start: { x: number; y: number }; distance: number; anchor: Anchor } | null =
      null;
    let factor = 1;
    let shift = { x: 0, y: 0 };
    let frame = 0;
    let wheelTimer = 0;
    const local = (x: number, y: number) => {
      const rect = node.getBoundingClientRect();
      return { x: x - rect.left, y: y - rect.top };
    };
    const paint = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const doc = content.current;
        if (doc) doc.style.transform = `translate(${shift.x}px, ${shift.y}px) scale(${factor})`;
      });
    };
    const begin = (point: { x: number; y: number }, distance: number) => {
      const a = capture(point.x, point.y);
      const doc = content.current;
      if (!a || !doc) return false;
      gesture = { start: point, distance, anchor: a };
      factor = 1;
      shift = { x: 0, y: 0 };
      doc.style.transformOrigin = `${node.scrollLeft + point.x - doc.offsetLeft}px ${
        node.scrollTop + point.y - doc.offsetTop
      }px`;
      doc.style.willChange = "transform";
      return true;
    };
    const reset = () => {
      cancelAnimationFrame(frame);
      const doc = content.current;
      if (doc) {
        doc.style.transform = "";
        doc.style.willChange = "";
      }
    };
    const finish = (commit: boolean) => {
      window.clearTimeout(wheelTimer);
      if (!gesture) return;
      const g = gesture;
      gesture = null;
      reset();
      if (!commit || Math.abs(factor - 1) < 0.01) return;
      anchor.current = { ...g.anchor, vx: g.start.x + shift.x, vy: g.start.y + shift.y };
      setFit(null);
      setCustom(clampZoom(zoom * factor, RANGE.min, RANGE.max));
    };
    const scaleTo = (next: number) => {
      factor = clampZoom(zoom * next, RANGE.min, RANGE.max) / zoom;
      paint();
    };
    const midpoint = (e: TouchEvent) =>
      local(
        (e.touches[0]!.clientX + e.touches[1]!.clientX) / 2,
        (e.touches[0]!.clientY + e.touches[1]!.clientY) / 2,
      );
    const spread = (e: TouchEvent) =>
      Math.hypot(
        e.touches[0]!.clientX - e.touches[1]!.clientX,
        e.touches[0]!.clientY - e.touches[1]!.clientY,
      );
    const start = (e: TouchEvent) => {
      if (e.touches.length === 2) begin(midpoint(e), spread(e));
      else if (e.touches.length > 2) finish(false);
    };
    const move = (e: TouchEvent) => {
      if (!gesture || e.touches.length !== 2) return;
      e.preventDefault();
      const mid = midpoint(e);
      shift = { x: mid.x - gesture.start.x, y: mid.y - gesture.start.y };
      scaleTo(spread(e) / gesture.distance);
    };
    const end = (e: TouchEvent) => {
      if (gesture && e.touches.length < 2) finish(true);
    };
    const cancel = () => finish(false);
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (!gesture && !begin(local(e.clientX, e.clientY), 1)) return;
      scaleTo(factor * Math.exp(-Math.max(-50, Math.min(50, e.deltaY)) * 0.005));
      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(() => finish(true), 160);
    };
    // Safari's own pinch would zoom the whole page.
    const gestureEvent = (e: Event) => e.preventDefault();
    node.addEventListener("touchstart", start, { passive: true });
    node.addEventListener("touchmove", move, { passive: false });
    node.addEventListener("touchend", end);
    node.addEventListener("touchcancel", cancel);
    node.addEventListener("wheel", wheel, { passive: false });
    node.addEventListener("gesturestart", gestureEvent);
    node.addEventListener("gesturechange", gestureEvent);
    return () => {
      finish(false);
      node.removeEventListener("touchstart", start);
      node.removeEventListener("touchmove", move);
      node.removeEventListener("touchend", end);
      node.removeEventListener("touchcancel", cancel);
      node.removeEventListener("wheel", wheel);
      node.removeEventListener("gesturestart", gestureEvent);
      node.removeEventListener("gesturechange", gestureEvent);
    };
  }, [zoom, capture, count, scrollerNode]);

  const renderer = useMemo(
    () =>
      ({ str, pageNumber, itemIndex }: { str: string; pageNumber: number; itemIndex: number }) =>
        markRanges(str, marks.get(pageNumber)?.get(itemIndex)),
    [marks],
  );
  const pixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;

  return (
    <div
      ref={container}
      data-invert={invert}
      className={cn(
        "pdf-view relative flex min-h-0 w-full flex-col overflow-hidden bg-surface-3",
        "h-full flex-1",
        compact && "min-h-60",
      )}
    >
      <Document
        file={url}
        suspense={false}
        onLoadSuccess={setPdf}
        onLoadError={(e) => onError(e.message)}
        onPassword={() => onError("This PDF is password-protected.")}
        className="flex min-h-0 flex-1"
        loading={<ViewerLoading label="Loading PDF" />}
      >
        {rail && count > 0 ? (
          <aside
            aria-label="Page thumbnails"
            className="relative hidden w-32 shrink-0 overflow-y-auto overscroll-contain border-r border-border bg-surface-2 px-3 pt-3 pb-20 md:block"
          >
            {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
              <Thumbnail
                key={n}
                n={n}
                active={n === current}
                ratio={sizeOf(n).h / sizeOf(n).w}
                onClick={() => goTo(n)}
              />
            ))}
          </aside>
        ) : null}
        <div
          ref={attachScroller}
          tabIndex={0}
          aria-label="Document pages"
          className="relative min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain outline-none [overflow-anchor:none]"
          style={{ padding: `${PAD}px ${PAD}px 88px`, touchAction: "pan-x pan-y" }}
        >
          <div
            ref={content}
            className="flex flex-col items-center gap-4"
            style={{ minWidth: Math.floor(widest * zoom) }}
          >
            {Array.from({ length: count }, (_, i) => i + 1).map((n) => {
              const size = sizeOf(n);
              const w = Math.floor(size.w * zoom);
              const h = Math.floor(size.h * zoom);
              return (
                <div
                  key={n}
                  ref={(node) => {
                    if (node) nodes.current.set(n, node);
                    else nodes.current.delete(n);
                  }}
                  data-page={n}
                  aria-label={`Page ${n}`}
                  className={cn(
                    "relative shrink-0 bg-surface-4 shadow-[0_1px_3px_rgb(0_0_0/0.3)] transition-[box-shadow] duration-500",
                    flash === n && "shadow-[0_0_0_2px_var(--ruth)]",
                  )}
                  style={{ width: w, height: h }}
                >
                  {near.has(n) ? (
                    <Page
                      pageNumber={n}
                      width={w}
                      devicePixelRatio={safePixelRatio(pixelRatio, w, h)}
                      renderTextLayer
                      renderAnnotationLayer
                      customTextRenderer={renderer}
                      loading={null}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </Document>
      {count > 0 ? (
        <ViewerDock
          zoom={zoom}
          range={RANGE}
          onZoom={changeZoom}
          paging={count ? { current, total: count, onPage: goTo } : undefined}
          onFitWidth={() => changeFit("width")}
          onFitPage={() => changeFit("page")}
          onThumbnails={() => setRail(!rail)}
          thumbnailsOpen={rail}
          compact={compact}
          url={url}
          target={container}
          visible={dockVisible}
          invert={{ checked: invert, onChange: setInvert }}
        />
      ) : null}
    </div>
  );
}

function Thumbnail({
  n,
  active,
  ratio,
  onClick,
}: {
  n: number;
  active: boolean;
  ratio: number;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([e]) => e?.isIntersecting && setNear(true), {
      root: node.parentElement,
      rootMargin: "200px 0px",
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const node = ref.current;
    const rail = node?.parentElement;
    if (!active || !node || !rail) return;
    // Scroll the rail only; scrollIntoView would also move the page around the viewer.
    if (node.offsetTop < rail.scrollTop) rail.scrollTop = node.offsetTop - 12;
    else if (node.offsetTop + node.offsetHeight > rail.scrollTop + rail.clientHeight)
      rail.scrollTop = node.offsetTop + node.offsetHeight - rail.clientHeight + 12;
  }, [active]);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={`Go to page ${n}`}
      aria-current={active ? "page" : undefined}
      className="group mb-3 flex w-full flex-col items-center gap-1 text-xs text-muted-foreground aria-[current=page]:text-foreground"
    >
      <span
        className="block w-full overflow-hidden bg-white ring-1 ring-border group-aria-[current=page]:ring-2 group-aria-[current=page]:ring-ruth"
        style={{ aspectRatio: `1 / ${ratio}` }}
      >
        {near ? (
          <Page
            pageNumber={n}
            width={104}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            loading={null}
          />
        ) : null}
      </span>
      <span className="tabular-nums">{n}</span>
    </button>
  );
}
