"use client";
import {
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useTheme } from "next-themes";
import {
  XlsxViewer,
  useXlsxViewerController,
  type XlsxViewerProps,
} from "@extend-ai/react-xlsx";
import { ViewerDock, useScrollActivatedDock } from "./ViewerDock";
import { OfficeFailure, OfficeLoading, type OfficeViewProps } from "./office-shared";

/** The cited text and its first words: a long quote rarely matches one cell exactly. */
function citedTerms(q: string | undefined) {
  const clean = q?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
  if (!clean) return [];
  return [...new Set([clean, clean.split(" ").slice(0, 4).join(" ")])].filter(
    (term) => term.length >= 2,
  );
}

/**
 * Excel workbooks through react-xlsx's canvas renderer (formatting, merged cells, charts),
 * read-only, with worksheet tabs and the shared dock driving its zoom. A cited passage is
 * tinted in every cell that contains it.
 */
export default function OfficeWorkbook({ url, name, q, compact, target, onRetry }: OfficeViewProps) {
  const controller = useXlsxViewerController({
    fileName: name,
    readOnly: true,
    readOnlyAboveBytes: 0,
    showHiddenSheets: false,
    src: url,
  });
  const { resolvedTheme } = useTheme();
  const viewport = useRef<HTMLDivElement | null>(null);
  // Not loading also before the fetch starts: ready means parsed sheets and their tabs.
  const ready =
    !controller.isLoading && !controller.error && controller.sheets.length > 0 && controller.tabs.length > 0;
  const dockVisible = useScrollActivatedDock(viewport, ready, target);
  const terms = useMemo(() => citedTerms(q), [q]);

  const renderScroller = useCallback(
    ({
      children,
      viewportProps,
    }: {
      children: ReactNode;
      viewportProps: HTMLAttributes<HTMLDivElement> & {
        ref: Ref<HTMLDivElement>;
        style: CSSProperties;
        tabIndex: number;
      };
    }) => (
      <div
        {...viewportProps}
        ref={(node) => {
          viewport.current = node;
          const { ref } = viewportProps;
          if (typeof ref === "function") ref(node);
          else if (ref) (ref as { current: HTMLDivElement | null }).current = node;
        }}
        className={["h-full min-h-0 overflow-auto overscroll-contain", viewportProps.className]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </div>
    ),
    [],
  );

  const getCellStyle = useCallback<NonNullable<XlsxViewerProps["getCellStyle"]>>(
    ({ value }) => {
      if (!terms.length || !value) return undefined;
      const lower = value.toLowerCase();
      return terms.some((term) => lower.includes(term))
        ? { backgroundColor: "rgba(171, 196, 255, 0.35)" }
        : undefined;
    },
    [terms],
  );

  // Open on the first cell that contains the citation, searching every worksheet. The
  // controller is a new object each render, so the search reads it through a ref.
  const live = useRef(controller);
  live.current = controller;
  const located = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !terms.length) return;
    const key = `${url}#${terms[0]}`;
    if (located.current === key) return;
    let cancelled = false;
    const controller = live.current;
    void (async () => {
      for (const [tabIndex, tab] of controller.tabs.entries()) {
        if (tab.kind !== "sheet" || tab.sheetIndex === undefined) continue;
        const sheet = controller.sheets[tab.sheetIndex];
        if (!sheet) continue;
        const hit = await findCell(controller, sheet, terms);
        if (cancelled) return;
        if (hit) {
          located.current = key;
          controller.setActiveTabIndex(tabIndex);
          // The viewer resets its scroller after a tab switch renders, so settle on the cell a
          // few times. Not tied to `cancelled`: the switch itself may re-run this effect.
          const reveal = () => {
            live.current.selectCell(hit);
            const node = viewport.current;
            if (!node) return;
            const scale = live.current.zoomScale / 100;
            const offset = (sizes: number[], fallback: number, n: number) =>
              Array.from({ length: Math.max(0, n) }, (_, i) => sizes[i] ?? fallback).reduce(
                (a, b) => a + b,
                0,
              );
            node.scrollTo({
              top: offset(sheet.rowHeights, sheet.defaultRowHeightPx, hit.row - 3) * scale,
              left: offset(sheet.colWidths, sheet.defaultColWidthPx, hit.col - 1) * scale,
            });
          };
          for (const delay of [50, 250, 600]) window.setTimeout(reveal, delay);
          return;
        }
      }
      located.current = key;
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, terms, url]);

  const tabs = controller.tabs;
  return (
    <>
      {tabs.length > 1 ? (
        <div
          role="tablist"
          aria-label="Worksheets"
          className="flex shrink-0 overflow-x-auto border-b border-border [scrollbar-width:none]"
        >
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={controller.activeTabIndex === index}
              onClick={() => controller.setActiveTabIndex(index)}
              className="h-11 max-w-44 shrink-0 truncate border-b-2 border-transparent px-4 text-[13px] text-muted-foreground aria-selected:border-foreground aria-selected:text-foreground md:h-9"
            >
              {tab.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1 pb-16">
        <XlsxViewer
          controller={controller}
          readOnly
          experimentalCanvas
          isDark={resolvedTheme !== "light"}
          rounded={false}
          showDefaultToolbar={false}
          toolbar={null}
          height="100%"
          selectionColor="#ABC4FF"
          getCellStyle={getCellStyle}
          renderScroller={renderScroller}
          loadingState={<OfficeLoading label="Loading workbook" />}
          emptyState={<OfficeFailure message="This workbook is empty" url={url} />}
          errorState={(error) => (
            <OfficeFailure message={error.message} url={url} onRetry={onRetry} />
          )}
        />
      </div>
      <ViewerDock
        zoom={controller.zoomScale / 100}
        range={{
          min: controller.minZoomScale / 100,
          max: controller.maxZoomScale / 100,
          step: 0.1,
        }}
        onZoom={(next) => controller.setZoomScale(Math.round(next * 100))}
        onReset={controller.resetZoom}
        paging={
          tabs.length > 1
            ? {
                current: controller.activeTabIndex + 1,
                total: tabs.length,
                onPage: (n) => controller.setActiveTabIndex(n - 1),
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

type Controller = ReturnType<typeof useXlsxViewerController>;
type Sheet = Controller["sheets"][number];

type RowBatch = Array<{ index: number; cells: Array<{ col: number; value?: unknown }> }>;
type BatchSource = { getRowsBatch?: (start: number, count: number, options: object) => unknown };

/** Rows `[start, start + count)` from the parser worker, or the in-thread worksheet without one. */
async function rowsBatch(controller: Controller, sheet: number, start: number, count: number) {
  const rows =
    controller.isWorkerBacked && controller.getRowsBatchAsync
      ? await controller.getRowsBatchAsync(sheet, start, count)
      : (
          controller.workbook as unknown as { getSheet?: (index: number) => BatchSource } | null
        )
          ?.getSheet?.(sheet)
          ?.getRowsBatch?.(start, count, {});
  return Array.isArray(rows) ? (rows as RowBatch) : [];
}

/** Row/column of the first cell holding one of `terms`, read in row batches. */
async function findCell(controller: Controller, sheet: Sheet, terms: string[]) {
  const last = Math.min(sheet.maxUsedRow, 20_000);
  const rows: RowBatch = [];
  for (let start = Math.max(0, sheet.minUsedRow); start <= last; start += 1_000)
    rows.push(
      ...(await rowsBatch(controller, sheet.workbookSheetIndex, start, Math.min(1_000, last - start + 1))),
    );
  for (const term of terms)
    for (const row of rows)
      for (const cell of row.cells)
        if (String(cell.value ?? "").toLowerCase().includes(term))
          return { row: row.index, col: cell.col };
  return null;
}
