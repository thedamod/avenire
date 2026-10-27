"use client";
import {
  type ReactNode,
  type RefObject,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Maximize2,
  Minimize2,
  MoveHorizontal,
  PanelLeft,
  RectangleVertical,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@avenire/ui/components/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@avenire/ui/components/tooltip";
import { cn } from "@avenire/ui/lib/utils";
import { type ZoomRange, parsePageInput, parseZoomInput, stepZoom } from "./viewer-logic";

const PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

/**
 * Where the dock's menus and tooltips portal to. In fullscreen only the fullscreen element's
 * subtree is painted, so they have to render inside it rather than on document.body.
 */
const PortalTarget = createContext<HTMLElement | null>(null);

/** "Open original" through `reopenFile`, provided by the source viewer around its body. */
export const OpenOriginalContext = createContext<(() => void) | null>(null);

/**
 * Visible until the reader scrolls, then fades out 1s after scrolling stops; comes back on
 * scroll, a tap, or a mouse near the bottom edge. Off (always visible) when `active` is false.
 */
export function useScrollActivatedDock(
  viewport: RefObject<HTMLElement | null>,
  active = true,
  target?: RefObject<HTMLElement | null>,
) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const node = viewport.current;
    const area = target?.current ?? node;
    setVisible(true);
    if (!node || !area || !active) return;
    let timer = 0;
    const show = () => {
      setVisible(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setVisible(false), 1000);
    };
    const near = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return show();
      const rect = area.getBoundingClientRect();
      if (rect.bottom - e.clientY < 96) show();
    };
    node.addEventListener("scroll", show, { passive: true });
    area.addEventListener("pointermove", near, { passive: true });
    area.addEventListener("pointerdown", near, { passive: true });
    return () => {
      window.clearTimeout(timer);
      node.removeEventListener("scroll", show);
      area.removeEventListener("pointermove", near);
      area.removeEventListener("pointerdown", near);
    };
  }, [viewport, target, active]);
  return visible;
}

export function ViewerButton({
  label,
  children,
  onClick,
  disabled = false,
  pressed,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
}) {
  const container = useContext(PortalTarget);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          onClick={onClick}
          className="motion-press inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-40 aria-pressed:bg-hover aria-pressed:text-foreground md:size-8 [&_svg]:size-4"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent container={container}>{label}</TooltipContent>
    </Tooltip>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
}

/** A number field that edits a draft and commits on Enter or blur; Escape restores. */
function DraftInput({
  value,
  label,
  onCommit,
  className,
}: {
  value: string;
  label: string;
  onCommit: (raw: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  return (
    <input
      aria-label={label}
      inputMode="numeric"
      pattern="[0-9]*"
      enterKeyHint="go"
      value={draft ?? value}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value.replace(/\D+/g, ""))}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      onBlur={() => {
        if (!cancelled.current && draft !== null) onCommit(draft);
        cancelled.current = false;
        setDraft(null);
      }}
      className={cn(
        "h-8 rounded-md border border-transparent bg-surface-3 text-center text-[13px] font-medium tabular-nums text-foreground outline-none hover:border-border focus:border-ring md:h-7",
        className,
      )}
    />
  );
}

export interface DockPaging {
  readonly current: number;
  readonly total: number;
  readonly onPage: (page: number) => void;
  /** "Page", "Slide", "Section", "Sheet". */
  readonly unit?: string;
  /** Sheets switch by tab; prev/next still help on touch. */
  readonly arrows?: boolean;
}

/**
 * The floating viewer dock (after v1's document dock: a small rounded-md bar, not a pill):
 * page field + previous/next, then zoom out / editable percentage with presets / zoom in.
 * Full pages add fit, thumbnails, download, original and fullscreen; compact panes keep those
 * in the zoom menu or out of the way.
 */
export function ViewerDock({
  zoom,
  range,
  onZoom,
  paging,
  onFitWidth,
  onFitPage,
  onReset,
  onThumbnails,
  thumbnailsOpen,
  compact,
  url,
  original,
  target,
  visible = true,
  invert,
}: {
  zoom: number;
  range: ZoomRange;
  onZoom: (zoom: number) => void;
  paging?: DockPaging | undefined;
  onFitWidth?: (() => void) | undefined;
  onFitPage?: (() => void) | undefined;
  onReset?: (() => void) | undefined;
  onThumbnails?: (() => void) | undefined;
  thumbnailsOpen?: boolean;
  compact: boolean;
  url?: string | undefined;
  original?: string | undefined;
  target: RefObject<HTMLElement | null>;
  visible?: boolean;
  /** PDF dark mode toggle, shown in the zoom menu. */
  invert?: { checked: boolean; onChange: (checked: boolean) => void } | undefined;
}) {
  const openOriginal = useContext(OpenOriginalContext);
  const [fullscreen, setFullscreen] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === target.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, [target]);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void target.current?.requestFullscreen?.().catch(() => {});
  }, [target]);
  const shown = visible || engaged || menu;
  const portal = fullscreen ? target.current : null;
  const percent = String(Math.round(zoom * 100));
  const presets = PRESETS.filter((p) => p >= range.min && p <= range.max);
  const unit = paging?.unit ?? "Page";
  return (
    <PortalTarget.Provider value={portal}>
      <TooltipProvider delayDuration={300}>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <div
            role="toolbar"
            aria-label="Viewer controls"
            onPointerEnter={() => setEngaged(true)}
            onPointerLeave={() => setEngaged(false)}
            onFocusCapture={() => setEngaged(true)}
            onBlurCapture={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEngaged(false);
            }}
            className={cn(
              "flex h-12 max-w-full items-center gap-0.5 overflow-x-auto rounded-md border border-border bg-popover px-1.5 text-[13px] text-popover-foreground shadow-sm transition-[opacity,transform] md:h-10 duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] [scrollbar-width:none] motion-reduce:transition-opacity",
              shown
                ? "pointer-events-auto translate-y-0 opacity-100"
                : "translate-y-2 opacity-0 motion-reduce:translate-y-0",
            )}
          >
            {paging && paging.total > 0 ? (
              <>
                <span className="flex shrink-0 items-center gap-1.5 pr-1 pl-2">
                  <span className="hidden text-muted-foreground sm:inline">{unit}</span>
                  <DraftInput
                    label={`${unit} number`}
                    value={String(Math.max(1, paging.current))}
                    onCommit={(raw) => {
                      const page = parsePageInput(raw, paging.total);
                      if (page) paging.onPage(page);
                    }}
                    className="w-9"
                  />
                  <span className="whitespace-nowrap text-muted-foreground tabular-nums">
                    / {paging.total}
                  </span>
                </span>
                {paging.arrows !== false ? (
                  <>
                    <ViewerButton
                      label={`Previous ${unit.toLowerCase()}`}
                      disabled={paging.current <= 1}
                      onClick={() => paging.onPage(Math.max(1, paging.current - 1))}
                    >
                      <ChevronLeft />
                    </ViewerButton>
                    <ViewerButton
                      label={`Next ${unit.toLowerCase()}`}
                      disabled={paging.current >= paging.total}
                      onClick={() => paging.onPage(Math.min(paging.total, paging.current + 1))}
                    >
                      <ChevronRight />
                    </ViewerButton>
                  </>
                ) : null}
                <Divider />
              </>
            ) : null}
            <ViewerButton
              label="Zoom out"
              disabled={zoom <= range.min + 0.001}
              onClick={() => onZoom(stepZoom(zoom, -1, range))}
            >
              <ZoomOut />
            </ViewerButton>
            <span className="flex shrink-0 items-center">
              <DraftInput
                label="Zoom percentage"
                value={percent}
                onCommit={(raw) => {
                  const next = parseZoomInput(raw, range);
                  if (next !== null) onZoom(next);
                }}
                className="w-11"
              />
              <DropdownMenu open={menu} onOpenChange={setMenu}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Zoom presets"
                    className="inline-flex h-10 items-center gap-0.5 rounded-md pr-1 pl-1 text-foreground hover:bg-hover md:h-7"
                  >
                    %
                    <ChevronDown className="size-3 text-muted-foreground" aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  align="center"
                  className="min-w-36"
                  container={portal}
                >
                  {onFitWidth ? (
                    <DropdownMenuItem onSelect={onFitWidth}>
                      <MoveHorizontal /> Fit width
                    </DropdownMenuItem>
                  ) : null}
                  {onFitPage ? (
                    <DropdownMenuItem onSelect={onFitPage}>
                      <RectangleVertical /> Fit page
                    </DropdownMenuItem>
                  ) : null}
                  {onReset ? (
                    <DropdownMenuItem onSelect={onReset}>
                      <RotateCcw /> Reset view
                    </DropdownMenuItem>
                  ) : null}
                  {invert ? (
                    <DropdownMenuCheckboxItem
                      checked={invert.checked}
                      onCheckedChange={(checked) => invert.onChange(checked === true)}
                    >
                      PDF dark mode
                    </DropdownMenuCheckboxItem>
                  ) : null}
                  {onFitWidth || onFitPage || onReset || invert ? <DropdownMenuSeparator /> : null}
                  {presets.map((preset) => (
                    <DropdownMenuItem
                      key={preset}
                      onSelect={() => onZoom(preset)}
                      className={cn(
                        "tabular-nums",
                        Math.abs(preset - zoom) < 0.005 && "text-ruth-text",
                      )}
                    >
                      {Math.round(preset * 100)}%
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
            <ViewerButton
              label="Zoom in"
              disabled={zoom >= range.max - 0.001}
              onClick={() => onZoom(stepZoom(zoom, 1, range))}
            >
              <ZoomIn />
            </ViewerButton>
            {!compact && (
              <>
                <Divider />
                {onReset && (
                  <ViewerButton label="Reset view" onClick={onReset}>
                    <RotateCcw />
                  </ViewerButton>
                )}
                {onFitWidth && (
                  <span className="hidden sm:contents">
                    <ViewerButton label="Fit width" onClick={onFitWidth}>
                      <MoveHorizontal />
                    </ViewerButton>
                  </span>
                )}
                {onFitPage && (
                  <span className="hidden sm:contents">
                    <ViewerButton label="Fit page" onClick={onFitPage}>
                      <RectangleVertical />
                    </ViewerButton>
                  </span>
                )}
                {onThumbnails && (
                  <span className="hidden md:contents">
                    <ViewerButton
                      label="Page thumbnails"
                      pressed={thumbnailsOpen ?? false}
                      onClick={onThumbnails}
                    >
                      <PanelLeft />
                    </ViewerButton>
                  </span>
                )}
                {url && (
                  <DockLink href={url} label="Download" download>
                    <Download />
                  </DockLink>
                )}
                {openOriginal ? (
                  <ViewerButton label="Open original" onClick={openOriginal}>
                    <ExternalLink />
                  </ViewerButton>
                ) : (original ?? url) ? (
                  <DockLink href={(original ?? url)!} label="Open original">
                    <ExternalLink />
                  </DockLink>
                ) : null}
                <ViewerButton
                  label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
                  onClick={toggleFullscreen}
                >
                  {fullscreen ? <Minimize2 /> : <Maximize2 />}
                </ViewerButton>
              </>
            )}
          </div>
        </div>
      </TooltipProvider>
    </PortalTarget.Provider>
  );
}

function DockLink({
  href,
  label,
  download,
  children,
}: {
  href: string;
  label: string;
  download?: boolean;
  children: ReactNode;
}) {
  const container = useContext(PortalTarget);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={href}
          download={download}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground md:size-8 [&_svg]:size-4"
        >
          {children}
        </a>
      </TooltipTrigger>
      <TooltipContent container={container}>{label}</TooltipContent>
    </Tooltip>
  );
}
