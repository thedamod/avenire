"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { AvenireOverlayBridge } from "@avenire/desktop/bridge";
import { CapturePanel, type RenderCaptureLink } from "./CapturePanel";
import { ShortcutKeycaps } from "./CaptureShortcutKeys";
import { overlayRows, type CapturePhase } from "./liveCapture";
import { initialOverlayView, overlayView } from "./overlayView";

/** `--duration-popover`: the exit (faster than the 200ms enter), then main hides the window. */
const EXIT_MS = 150;

/**
 * The global capture overlay: the in-app capture panel in an always-on-top, transparent window
 * in the bottom-right corner. Main streams the state; this only animates, measures and forwards
 * clicks. The window is sized to `.capture-overlay`, whose transparent gutter gives the enter
 * offset room so the panel never clips against the window edge.
 */
export function CaptureOverlay({ bridge }: { bridge: AvenireOverlayBridge }) {
  const [view, dispatch] = useReducer(overlayView, initialOverlayView);
  const { state, shown } = view;

  useEffect(() => bridge.onState((next) => dispatch({ type: "state", state: next })), [bridge]);

  // Main hid the window without an exit: the next capture enters afresh.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") dispatch({ type: "hidden" });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (shown !== "closing") return;
    const timer = setTimeout(() => {
      dispatch({ type: "hidden" });
      void bridge.dismissed();
    }, EXIT_MS);
    return () => clearTimeout(timer);
  }, [bridge, shown]);

  // Hover keeps the overlay up and lets it take clicks; never leave it claimed once gone.
  const hovered = useRef(false);
  const hover = useCallback(
    (next: boolean) => {
      if (hovered.current === next) return;
      hovered.current = next;
      void bridge.setHovered(next);
    },
    [bridge],
  );
  useEffect(() => {
    if (shown !== "open") hover(false);
  }, [hover, shown]);

  // The window fits the panel: report its height (gutter included) whenever it changes.
  const height = useRef(0);
  const measure = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) return;
      const report = () => {
        const next = element.offsetHeight;
        if (next === height.current) return;
        height.current = next;
        void bridge.resize(next);
      };
      const observer = new ResizeObserver(report);
      observer.observe(element);
      report();
      return () => observer.disconnect();
    },
    [bridge],
  );

  const id = state?.id;
  const close = useCallback(() => dispatch({ type: "close" }), []);
  const renderLink = useCallback<RenderCaptureLink>(
    (target, { className, children }) => (
      <button
        type="button"
        className={className}
        onClick={() => {
          void (target.type === "file" ? bridge.open(target.file.id) : bridge.openSources());
          close();
        }}
      >
        {children}
      </button>
    ),
    [bridge, close],
  );
  const undo = useCallback(() => {
    if (!id) return;
    void bridge.undo(id);
    close();
  }, [bridge, close, id]);

  const items = state?.items;
  const receipt = state?.receipt;
  const rows = useMemo(() => overlayRows(items ?? [], receipt), [items, receipt]);

  if (!state || shown === "hidden") return null;
  const phase: CapturePhase =
    state.phase === "done" ? "done" : state.phase === "failed" ? "failed" : "capturing";
  const closing = shown === "closing";
  return (
    <div
      key={view.entry}
      ref={measure}
      className="capture-overlay"
      data-closing={closing ? "" : undefined}
      inert={closing}
    >
      <CapturePanel
        rows={rows}
        phase={phase}
        error={state.error}
        keys={
          state.shortcut ? (
            <ShortcutKeycaps shortcut={state.shortcut} mac={bridge.platform === "darwin"} />
          ) : null
        }
        onUndo={receipt?.files.length ? undo : undefined}
        renderLink={renderLink}
        favicons={false}
        listClassName="max-h-[300px]"
        className="w-full"
        onPointerEnter={() => hover(true)}
        onPointerLeave={() => hover(false)}
      />
    </div>
  );
}
