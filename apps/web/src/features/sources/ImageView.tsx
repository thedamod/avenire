"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { cn } from "@avenire/ui/lib/utils";
import type { Region } from "./citation";
import { ViewerDock } from "./ViewerDock";
import { ZOOM_RANGE, clampPan, clampZoom } from "./viewer-logic";

const RANGE = ZOOM_RANGE.image;
const DOUBLE_TAP_ZOOM = 2.25;
type Point = { x: number; y: number };

/**
 * An image you can pinch, drag, wheel and double-tap (to 225% at the tap, again to reset).
 * The cited `region` is drawn inside the transformed layer so it stays on the pixels it marks.
 */
export function ImageView({
  url,
  alt,
  region,
  compact,
}: {
  url: string;
  alt: string;
  region: Region | undefined;
  compact: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const value = useRef({ scale: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<number | null>(null);
  const frame = useRef(0);
  const lastTap = useRef<{ at: number; point: Point } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  /** Clamp to the image's real bounds and paint on the next frame; `animate` eases 140ms. */
  const commit = useCallback((scale: number, x: number, y: number, animate = false) => {
    const view = viewport.current;
    const img = image.current;
    if (!view || !img) return;
    const s = clampZoom(scale, RANGE.min, RANGE.max);
    value.current = {
      scale: s,
      x: clampPan(x, img.offsetWidth, view.clientWidth, s),
      y: clampPan(y, img.offsetHeight, view.clientHeight, s),
    };
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const node = layer.current;
      if (!node) return;
      const t = value.current;
      node.style.transition = animate ? "transform 140ms cubic-bezier(0.2, 0, 0, 1)" : "none";
      node.style.transform = `translate3d(${t.x}px, ${t.y}px, 0) scale(${t.scale})`;
    });
    setZoom(s);
  }, []);

  /** Zoom about a point given relative to the viewport's centre (keeps it under the finger). */
  const zoomTo = useCallback(
    (requested: number, focal?: Point, animate = false) => {
      const t = value.current;
      const scale = clampZoom(requested, RANGE.min, RANGE.max);
      const ratio = scale / t.scale;
      const f = focal ?? { x: 0, y: 0 };
      commit(scale, (t.x - f.x) * ratio + f.x, (t.y - f.y) * ratio + f.y, animate);
    },
    [commit],
  );
  const reset = useCallback(() => commit(1, 0, 0, true), [commit]);
  const fromCentre = (clientX: number, clientY: number): Point => {
    const rect = viewport.current!.getBoundingClientRect();
    return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 };
  };

  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = Math.max(-50, Math.min(50, e.deltaY));
      zoomTo(value.current.scale * Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.004)), {
        ...fromCentre(e.clientX, e.clientY),
      });
    };
    const gesture = (e: Event) => e.preventDefault();
    node.addEventListener("wheel", wheel, { passive: false });
    node.addEventListener("gesturestart", gesture);
    node.addEventListener("gesturechange", gesture);
    const observer = new ResizeObserver(() =>
      commit(value.current.scale, value.current.x, value.current.y),
    );
    observer.observe(node);
    commit(1, 0, 0);
    return () => {
      node.removeEventListener("wheel", wheel);
      node.removeEventListener("gesturestart", gesture);
      node.removeEventListener("gesturechange", gesture);
      observer.disconnect();
      cancelAnimationFrame(frame.current);
      pointers.current.clear();
      pinch.current = null;
    };
  }, [url, commit, zoomTo]);

  const release = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    pinch.current = null;
    if (!pointers.current.size) setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const ready = loaded === url;
  return (
    <div ref={root} className="relative overflow-hidden bg-surface-3">
      <div
        ref={viewport}
        className={cn(
          "relative flex touch-none items-center justify-center overflow-hidden overscroll-none select-none",
          compact ? "h-[42dvh] min-h-60" : "h-[68dvh] min-h-[360px]",
          "[:fullscreen_&]:h-dvh",
          zoom > 1 ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in",
        )}
        onPointerDown={(e) => {
          if (e.button !== 0 && e.pointerType === "mouse") return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const point = { x: e.clientX, y: e.clientY };
          pointers.current.set(e.pointerId, point);
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            pinch.current = Math.hypot(a!.x - b!.x, a!.y - b!.y);
            lastTap.current = null;
            return;
          }
          if (pointers.current.size !== 1) return;
          const previous = lastTap.current;
          if (
            previous &&
            Date.now() - previous.at < 280 &&
            Math.hypot(point.x - previous.point.x, point.y - previous.point.y) < 20
          ) {
            if (value.current.scale > 1) reset();
            else zoomTo(DOUBLE_TAP_ZOOM, fromCentre(point.x, point.y), true);
            lastTap.current = null;
          } else lastTap.current = { at: Date.now(), point };
        }}
        onPointerMove={(e) => {
          const old = pointers.current.get(e.pointerId);
          if (!old) return;
          const point = { x: e.clientX, y: e.clientY };
          if (lastTap.current && Math.hypot(point.x - old.x, point.y - old.y) > 6)
            lastTap.current = null;
          pointers.current.set(e.pointerId, point);
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
            if (pinch.current)
              zoomTo(
                (value.current.scale * distance) / pinch.current,
                fromCentre((a!.x + b!.x) / 2, (a!.y + b!.y) / 2),
              );
            pinch.current = distance;
          } else if (pointers.current.size === 1 && value.current.scale > 1) {
            setDragging(true);
            commit(
              value.current.scale,
              value.current.x + point.x - old.x,
              value.current.y + point.y - old.y,
            );
          }
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={(e) => {
          pointers.current.delete(e.pointerId);
          pinch.current = null;
          if (!pointers.current.size) setDragging(false);
        }}
      >
        <div
          ref={layer}
          className={cn(
            "relative max-h-full max-w-full origin-center transition-opacity duration-150",
            ready ? "opacity-100" : "opacity-0",
          )}
        >
          <img
            key={url}
            ref={image}
            src={url}
            alt={alt}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            onLoad={() => {
              setLoaded(url);
              commit(1, 0, 0);
            }}
            onError={() => setFailed(url)}
            className={cn(
              "block max-w-full object-contain select-none",
              compact ? "max-h-[42dvh]" : "max-h-[68dvh]",
              "[:fullscreen_&]:max-h-dvh",
            )}
          />
          {region && (
            <div
              className="pointer-events-none absolute border-2 border-ruth bg-ruth/15"
              style={{
                left: `${region.x * 100}%`,
                top: `${region.y * 100}%`,
                width: `${region.w * 100}%`,
                height: `${region.h * 100}%`,
              }}
            >
              <span className="absolute top-0 left-0 bg-ruth px-1 text-[10px] text-ruth-foreground">
                cited
              </span>
            </div>
          )}
        </div>
        {!ready ? (
          <span className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
            {failed === url ? "Couldn't load the image." : "Loading image…"}
          </span>
        ) : null}
      </div>
      <ViewerDock
        zoom={zoom}
        range={RANGE}
        onZoom={(n) => zoomTo(n, undefined, true)}
        onReset={reset}
        compact={compact}
        url={url}
        target={root}
      />
    </div>
  );
}
