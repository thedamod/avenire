import * as React from "react";
import { cn } from "../lib/utils.ts";

export type ScrollFadeAxis = "x" | "y";

/** Within this many px of an edge counts as "at the edge" (sub-pixel scroll positions). */
const EDGE_TOLERANCE = 1;

function edgeState(element: HTMLElement, axis: ScrollFadeAxis): string {
  const offset = axis === "y" ? element.scrollTop : Math.abs(element.scrollLeft);
  const range =
    axis === "y"
      ? element.scrollHeight - element.clientHeight
      : element.scrollWidth - element.clientWidth;
  const start = offset > EDGE_TOLERANCE;
  const end = range - offset > EDGE_TOLERANCE;
  return start && end ? "start end" : start ? "start" : end ? "end" : "";
}

/**
 * Keeps `data-scroll-fade="start end"` on a scroller in step with whether there is content
 * beyond each edge. Pair with the `edge-fade-y` / `edge-fade-x` utility. Work happens at most
 * once per animation frame (passive scroll + ResizeObserver on the scroller and its children),
 * and the attribute is only written when an edge flips, so scrolling never re-renders React.
 * Returns a cleanup function.
 */
export function attachScrollFade(element: HTMLElement, axis: ScrollFadeAxis = "y"): () => void {
  let frame = 0;
  const update = () => {
    frame = 0;
    const next = edgeState(element, axis);
    if ((element.getAttribute("data-scroll-fade") ?? "") === next) return;
    if (next) element.setAttribute("data-scroll-fade", next);
    else element.removeAttribute("data-scroll-fade");
  };
  const schedule = () => {
    if (frame === 0) frame = requestAnimationFrame(update);
  };

  element.addEventListener("scroll", schedule, { passive: true });
  const resize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(schedule);
  const observeChildren = () => {
    if (!resize) return;
    for (const child of element.children) resize.observe(child);
  };
  resize?.observe(element);
  observeChildren();
  // Direct children only: enough for lists that append rows, cheap during streaming.
  const mutations =
    typeof MutationObserver === "undefined"
      ? undefined
      : new MutationObserver(() => {
          observeChildren();
          schedule();
        });
  mutations?.observe(element, { childList: true });
  schedule();

  return () => {
    if (frame !== 0) cancelAnimationFrame(frame);
    element.removeEventListener("scroll", schedule);
    resize?.disconnect();
    mutations?.disconnect();
  };
}

/** Ref callback form of `attachScrollFade` (React 19 ref cleanup). Stable per axis. */
export function useScrollFade<T extends HTMLElement = HTMLDivElement>(
  axis: ScrollFadeAxis = "y",
): React.RefCallback<T> {
  return React.useCallback(
    (element: T | null) => (element ? attachScrollFade(element, axis) : undefined),
    [axis],
  );
}

/** Merge ref callbacks / ref objects into one callback. */
export function composeRefs<T>(
  ...refs: readonly (React.Ref<T> | undefined)[]
): React.RefCallback<T> {
  return (node: T | null) => {
    const cleanups: (() => void)[] = [];
    for (const ref of refs) {
      if (typeof ref === "function") {
        const cleanup = ref(node);
        if (typeof cleanup === "function") cleanups.push(cleanup);
      } else if (ref) (ref as React.RefObject<T | null>).current = node;
    }
    return () => {
      for (const cleanup of cleanups) cleanup();
      for (const ref of refs)
        if (ref && typeof ref !== "function") (ref as React.RefObject<T | null>).current = null;
    };
  };
}

/**
 * A scroller whose edges fade only when there is content beyond them. Give it the overflow and
 * size classes you'd give the plain div (`max-h-72 overflow-y-auto`, `flex overflow-x-auto`).
 * `size` overrides the fade length (default 24px).
 */
function ScrollFade({
  as = "div",
  axis = "y",
  size,
  className,
  style,
  ref,
  ...props
}: React.ComponentProps<"div"> & {
  /** Element to render; lists stay lists. */
  as?: "div" | "ul" | "ol";
  axis?: ScrollFadeAxis;
  size?: number;
}) {
  const fade = useScrollFade(axis);
  const merged = React.useMemo(() => composeRefs(ref, fade), [ref, fade]);
  const Element = as as "div";
  return (
    <Element
      ref={merged}
      data-slot="scroll-fade"
      className={cn(axis === "y" ? "edge-fade-y" : "edge-fade-x", className)}
      style={
        size === undefined
          ? style
          : ({ ...style, "--edge-fade-size": `${size}px` } as React.CSSProperties)
      }
      {...props}
    />
  );
}

export { ScrollFade };
