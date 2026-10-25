"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OfficeContentNode, SupportedFileType } from "officeparser/slim";
import { cn } from "@avenire/ui/lib/utils";
import { OfficeFailure, OfficeLoading } from "./office-shared";
import { ReadableDocument } from "./ReadableDocument";
import { ViewerDock, useScrollActivatedDock } from "./ViewerDock";
import { ZOOM_RANGE } from "./viewer-logic";

const RANGE = ZOOM_RANGE.office;

// The paged Word renderer and the workbook canvas are heavy: loaded only for those files.
const OfficeDocx = dynamic(() => import("./OfficeDocx"), {
  ssr: false,
  loading: () => <OfficeLoading />,
});
const OfficeWorkbook = dynamic(() => import("./OfficeWorkbook"), {
  ssr: false,
  loading: () => <OfficeLoading label="Loading workbook" />,
});

function nodeText(node: OfficeContentNode): string {
  return node.text ?? (node.children ?? []).map(nodeText).join("\n");
}
type Sheet = { name: string; rows: string[][] };
type Parsed =
  | { kind: "sheets"; sheets: Sheet[] }
  | { kind: "slides"; slides: string[] }
  | { kind: "html"; html: string };
function descendants(
  nodes: OfficeContentNode[],
  type: OfficeContentNode["type"],
): OfficeContentNode[] {
  return nodes.flatMap((node) =>
    node.type === type ? [node] : descendants(node.children ?? [], type),
  );
}
function words(value: string | undefined) {
  return new Set(
    (value ?? "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 3)
      .slice(0, 80),
  );
}
/** The section sharing the most words with the cited passage, or null. */
function bestMatch(texts: string[], q: string | undefined) {
  const wanted = words(q);
  if (!wanted.size) return null;
  let best: number | null = null;
  let score = 0;
  for (const [index, text] of texts.entries()) {
    const lower = text.toLowerCase();
    let hits = 0;
    for (const word of wanted) if (lower.includes(word)) hits++;
    if (hits > score) [best, score] = [index, hits];
  }
  return best;
}
/** "A".."Z", "AA".. for spreadsheet column headers. */
function columnName(index: number) {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

type OfficeViewProps = {
  url: string;
  type: SupportedFileType;
  compact: boolean;
  q?: string | undefined;
  page?: number | undefined;
  /** Fetch a fresh signed URL and try again (the old one may have expired). */
  onRetry?: (() => void) | undefined;
};

/**
 * Office files in the shared viewer frame and dock. Word documents are laid out as real pages
 * and Excel workbooks drawn with their formatting (react-docx / react-xlsx, as in v1);
 * OpenDocument, RTF, PowerPoint and CSV are parsed with officeparser into sections or a grid.
 */
export default function OfficeView(props: OfficeViewProps) {
  const root = useRef<HTMLDivElement>(null);
  const { type, compact, url, q, page, onRetry } = props;
  // react-xlsx 0.13 sniffs magic bytes and rejects plain-text CSV, so CSV stays on the parsed grid.
  const dedicated = type === "docx" || type === "xlsx";
  return (
    <div
      ref={root}
      className={cn(
        "relative flex min-h-0 w-full flex-col overflow-hidden bg-background",
        compact ? "h-full min-h-60 flex-1" : "h-[72dvh] min-h-[420px] md:rounded-[10px]",
      )}
    >
      {dedicated ? (
        (() => {
          const shared = { url, name: `source.${type}`, q, page, compact, target: root, onRetry };
          return type === "docx" ? <OfficeDocx {...shared} /> : <OfficeWorkbook {...shared} />;
        })()
      ) : (
        <ParsedOffice {...props} target={root} />
      )}
    </div>
  );
}

/** ODT/RTF/PPTX/ODP/ODS/CSV (formats the dedicated renderers can't take) via officeparser. */
function ParsedOffice({
  url,
  type,
  compact,
  q,
  page,
  onRetry,
  target: root,
}: OfficeViewProps & { target: React.RefObject<HTMLDivElement | null> }) {
  const [parsed, setParsed] = useState<{ url: string; value: Parsed } | null>(null);
  const [error, setError] = useState<{ url: string; message: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const [response, { OfficeParser }, { default: purifier }] = await Promise.all([
        fetch(url, { signal: controller.signal }),
        import("officeparser/slim"),
        import("dompurify"),
      ]);
      if (!response.ok) throw new Error(`Unable to load document (${response.status})`);
      const ast = await OfficeParser.parseOffice(new Uint8Array(await response.arrayBuffer()), {
        fileType: type,
        abortSignal: controller.signal,
        extractAttachments: true,
      });
      if (controller.signal.aborted) return;
      let value: Parsed;
      if (["xlsx", "csv", "ods"].includes(type)) {
        const nodes = descendants(ast.content, "sheet");
        const groups = nodes.length
          ? nodes
          : [{ type: "sheet" as const, text: "", children: ast.content }];
        value = {
          kind: "sheets",
          sheets: groups.map((sheet, i) => ({
            name:
              sheet.type === "sheet"
                ? (sheet.metadata?.sheetName ?? `Sheet ${i + 1}`)
                : `Sheet ${i + 1}`,
            rows: descendants(sheet.children ?? [], "row").map((row) =>
              descendants(row.children ?? [], "cell").map((cell) => cell.text ?? ""),
            ),
          })),
        };
      } else if (["pptx", "odp"].includes(type)) {
        value = {
          kind: "slides",
          slides: descendants(ast.content, "slide").map((slide) => nodeText(slide).trim()),
        };
      } else {
        const result = await ast.to("html");
        value = {
          kind: "html",
          html: purifier.sanitize(String(result.value), {
            USE_PROFILES: { html: true },
            FORBID_TAGS: ["style", "form", "input", "button"],
            FORBID_ATTR: ["style", "srcset"],
          }),
        };
      }
      if (!controller.signal.aborted) setParsed({ url, value });
    })().catch((cause: unknown) => {
      if (!controller.signal.aborted)
        setError({
          url,
          message: cause instanceof Error ? cause.message : "Unable to preview document",
        });
    });
    return () => controller.abort();
  }, [url, type]);

  const failed = error?.url === url ? error.message : null;
  const value = parsed?.url === url ? parsed.value : null;
  return (
    <>
      {failed ? (
        <OfficeFailure message={failed} url={url} onRetry={onRetry} />
      ) : value?.kind === "sheets" ? (
        <Workbook sheets={value.sheets} q={q} compact={compact} url={url} target={root} />
      ) : value?.kind === "slides" ? (
        <Sections
          sections={value.slides.map((text, i) => ({ title: `Slide ${i + 1}`, text }))}
          unit="Slide"
          q={q}
          page={page}
          compact={compact}
          url={url}
          target={root}
        />
      ) : value?.kind === "html" ? (
        <HtmlDocument html={value.html} q={q} compact={compact} url={url} target={root} />
      ) : (
        <OfficeLoading />
      )}
    </>
  );
}

type ViewProps = {
  q: string | undefined;
  compact: boolean;
  url: string;
  target: React.RefObject<HTMLDivElement | null>;
};

/** Index of the last section whose top has passed 120px into the viewport. */
function useActiveSection(
  viewport: React.RefObject<HTMLDivElement | null>,
  sections: React.RefObject<Array<HTMLElement | null>>,
  count: number,
) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const node = viewport.current;
    if (!node || count < 1) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const top = node.getBoundingClientRect().top;
        let next = 0;
        sections.current.forEach((section, index) => {
          if (section && section.getBoundingClientRect().top - top <= 120) next = index;
        });
        setActive(next);
      });
    };
    update();
    node.addEventListener("scroll", update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      node.removeEventListener("scroll", update);
    };
  }, [viewport, sections, count]);
  return [active, setActive] as const;
}

/** Scroll a section to the top of the viewer's own scroller (never the page around it). */
function scrollSection(
  viewport: HTMLDivElement | null,
  section: HTMLElement | null | undefined,
  smooth: boolean,
) {
  if (!viewport || !section) return;
  const top =
    section.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop;
  viewport.scrollTo({ top: top - 12, behavior: smooth ? "smooth" : "auto" });
}

/** Slides (and any sectioned text): one card per section, opened at `page` or the best match. */
function Sections({
  sections,
  unit,
  q,
  page,
  compact,
  url,
  target,
}: ViewProps & {
  sections: { title: string; text: string }[];
  unit: string;
  page?: number | undefined;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const refs = useRef<Array<HTMLElement | null>>([]);
  const [zoom, setZoom] = useState(1);
  const [active, setActive] = useActiveSection(viewport, refs, sections.length);
  const dockVisible = useScrollActivatedDock(viewport, true, target);
  const go = useCallback(
    (n: number, smooth = true) => {
      const index = Math.max(0, Math.min(sections.length - 1, n - 1));
      scrollSection(viewport.current, refs.current[index], smooth);
      setActive(index);
    },
    [sections.length, setActive],
  );
  const texts = useMemo(() => sections.map((s) => `${s.title} ${s.text}`), [sections]);
  useEffect(() => {
    const index = page ? page - 1 : bestMatch(texts, q);
    if (index !== null && index > 0) go(index + 1, false);
  }, [page, q, texts, go]);
  return (
    <>
      <div
        ref={viewport}
        className="min-h-0 flex-1 overflow-auto overscroll-contain bg-surface-3 px-3 pt-3 pb-24 md:px-4"
      >
        <ReadableDocument q={q} className="max-w-[920px] p-0">
          <div className="flex flex-col gap-3" style={{ zoom }}>
            {sections.map((section, index) => (
              <article
                key={index}
                ref={(node) => {
                  refs.current[index] = node;
                }}
                className={cn(
                  "min-h-[240px] rounded-[10px] border bg-background px-6 py-5 md:min-h-[360px] md:px-10 md:py-8",
                  page === index + 1 ? "border-ruth-line" : "border-border",
                )}
              >
                <header className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-3">
                  <h2 className="!my-0 truncate !text-[13px] font-medium text-foreground">
                    {section.title}
                  </h2>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {index + 1} / {sections.length}
                  </span>
                </header>
                <div className="text-[15px] leading-7 break-words whitespace-pre-wrap text-foreground">
                  {section.text || (
                    <span className="text-muted-foreground">No text on this slide.</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </ReadableDocument>
      </div>
      <ViewerDock
        zoom={zoom}
        range={RANGE}
        onZoom={setZoom}
        onReset={() => setZoom(1)}
        paging={{ current: active + 1, total: sections.length, onPage: go, unit }}
        compact={compact}
        url={url}
        target={target}
        visible={dockVisible}
      />
    </>
  );
}

/** A Word/OpenDocument/RTF file as HTML; its headings are the sections the dock pages through. */
function HtmlDocument({ html, q, compact, url, target }: ViewProps & { html: string }) {
  const viewport = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const headings = useRef<Array<HTMLElement | null>>([]);
  const [count, setCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [active, setActive] = useActiveSection(viewport, headings, count);
  const dockVisible = useScrollActivatedDock(viewport, true, target);
  useEffect(() => {
    const list = [...(body.current?.querySelectorAll<HTMLElement>("h1,h2") ?? [])];
    headings.current = list;
    setCount(list.length);
  }, [html]);
  return (
    <>
      <div ref={viewport} className="min-h-0 flex-1 overflow-auto overscroll-contain pb-20">
        <ReadableDocument q={q} scrollRoot={viewport}>
          <div ref={body} style={{ zoom }} dangerouslySetInnerHTML={{ __html: html }} />
        </ReadableDocument>
      </div>
      <ViewerDock
        zoom={zoom}
        range={RANGE}
        onZoom={setZoom}
        onReset={() => setZoom(1)}
        paging={
          count > 1
            ? {
                current: active + 1,
                total: count,
                unit: "Section",
                onPage: (n) => {
                  scrollSection(viewport.current, headings.current[n - 1], true);
                  setActive(n - 1);
                },
              }
            : undefined
        }
        compact={compact}
        url={url}
        target={target}
        visible={dockVisible}
      />
    </>
  );
}

/** Sheet tabs over a virtualised grid with A/B/C and row headers; opens on the cited cell. */
function Workbook({ sheets, q, compact, url, target }: ViewProps & { sheets: Sheet[] }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(600);
  const dockVisible = useScrollActivatedDock(viewport, true, target);
  const needle = q?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
  // The first cell containing the cited text (or its first words), across every sheet.
  const hit = useMemo(() => {
    if (!needle) return null;
    for (const term of [needle, needle.split(" ").slice(0, 4).join(" ")]) {
      for (const [s, sheet] of sheets.entries())
        for (const [r, row] of sheet.rows.entries())
          for (const [c, cell] of row.entries())
            if (cell.toLowerCase().includes(term)) return { s, r, c, term };
    }
    return null;
  }, [sheets, needle]);
  const rowHeight = 32 * zoom;
  const rowHeightRef = useRef(rowHeight);
  useEffect(() => {
    rowHeightRef.current = rowHeight;
  }, [rowHeight]);
  // Only when the citation changes, not on zoom.
  useEffect(() => {
    if (!hit) return;
    setCurrent(hit.s);
    requestAnimationFrame(() => {
      const node = viewport.current;
      if (node) node.scrollTop = Math.max(0, (hit.r - 3) * rowHeightRef.current);
    });
  }, [hit]);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setHeight(node.clientHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const sheet = sheets[current] ?? sheets[0]!;
  const columns = Math.max(1, ...sheet.rows.slice(0, 500).map((row) => row.length));
  const start = Math.max(0, Math.floor(top / rowHeight) - 5);
  const end = Math.min(sheet.rows.length, start + Math.ceil(height / rowHeight) + 10);
  const select = (index: number) => {
    setCurrent(index);
    setTop(0);
    if (viewport.current) viewport.current.scrollTop = 0;
  };
  return (
    <>
      {sheets.length > 1 ? (
        <div
          role="tablist"
          aria-label="Worksheets"
          className="flex shrink-0 overflow-x-auto border-b border-border [scrollbar-width:none]"
        >
          {sheets.map((s, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={current === i}
              onClick={() => select(i)}
              className="h-11 max-w-44 shrink-0 truncate border-b-2 border-transparent px-4 text-[13px] text-muted-foreground aria-selected:border-foreground aria-selected:text-foreground md:h-9"
            >
              {s.name}
            </button>
          ))}
        </div>
      ) : null}
      <div
        ref={viewport}
        role="tabpanel"
        aria-label={sheet.name}
        className="min-h-0 flex-1 overflow-auto overscroll-contain pb-20"
        onScroll={(e) => setTop(e.currentTarget.scrollTop)}
      >
        <table
          aria-rowcount={sheet.rows.length}
          className="border-separate border-spacing-0 text-left"
          style={{ fontSize: 12 * zoom }}
        >
          <thead>
            <tr style={{ height: rowHeight }}>
              <th className="sticky top-0 left-0 z-20 border-r border-b border-border bg-surface-2" />
              {Array.from({ length: columns }, (_, c) => (
                <th
                  key={c}
                  scope="col"
                  className="sticky top-0 z-10 border-r border-b border-border bg-surface-2 px-3 text-center font-normal text-muted-foreground"
                >
                  {columnName(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr aria-hidden="true" style={{ height: start * rowHeight }}>
              <td />
            </tr>
            {sheet.rows.slice(start, end).map((row, i) => {
              const r = start + i;
              return (
                <tr key={r} aria-rowindex={r + 1} style={{ height: rowHeight }}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-r border-b border-border bg-surface-2 px-2 text-right font-normal text-muted-foreground tabular-nums"
                  >
                    {r + 1}
                  </th>
                  {Array.from({ length: columns }, (_, c) => {
                    const cell = row[c] ?? "";
                    const marked =
                      hit && hit.s === current && cell.toLowerCase().includes(hit.term);
                    return (
                      <td
                        key={c}
                        title={cell.length > 40 ? cell : undefined}
                        className={cn(
                          "max-w-80 min-w-28 overflow-hidden border-r border-b border-border px-3 text-ellipsis whitespace-nowrap",
                          marked && "bg-ruth/20 shadow-[inset_0_0_0_1px_var(--ruth)]",
                        )}
                      >
                        {cell}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr
              aria-hidden="true"
              style={{ height: Math.max(0, sheet.rows.length - end) * rowHeight }}
            >
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <ViewerDock
        zoom={zoom}
        range={RANGE}
        onZoom={setZoom}
        onReset={() => setZoom(1)}
        paging={
          sheets.length > 1
            ? {
                current: current + 1,
                total: sheets.length,
                onPage: (n) => select(n - 1),
                unit: "Sheet",
              }
            : undefined
        }
        compact={compact}
        url={url}
        target={target}
        visible={dockVisible}
      />
    </>
  );
}
