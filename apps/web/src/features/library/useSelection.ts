"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { FileId } from "@avenire/contracts";

export interface Selection {
  readonly ids: ReadonlySet<FileId>;
  readonly size: number;
  has(id: FileId): boolean;
  toggle(id: FileId): void;
  set(ids: Iterable<FileId>): void;
  clear(): void;
}

export function useSelection(): Selection {
  const [ids, setIds] = useState<ReadonlySet<FileId>>(() => new Set());
  const toggle = useCallback((id: FileId) => {
    setIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const set = useCallback((next: Iterable<FileId>) => setIds(new Set(next)), []);
  const clear = useCallback(() => setIds(new Set()), []);
  return useMemo(
    () => ({ ids, size: ids.size, has: (id: FileId) => ids.has(id), toggle, set, clear }),
    [ids, toggle, set, clear],
  );
}

/**
 * Touch long-press (450 ms) to select a row. Returns handlers for the row; `consumeClick`
 * swallows the click that follows a long-press so it doesn't also open the row.
 */
export function useLongPress(onLongPress: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fired = useRef(false);
  const start = useRef<{ x: number; y: number }>(undefined);

  const cancel = useCallback(() => clearTimeout(timer.current), []);

  const handlers = useMemo(
    () => ({
      onPointerDown(event: React.PointerEvent) {
        fired.current = false;
        if (event.pointerType !== "touch") return;
        start.current = { x: event.clientX, y: event.clientY };
        timer.current = setTimeout(() => {
          fired.current = true;
          navigator.vibrate?.(10);
          onLongPress();
        }, 450);
      },
      onPointerMove(event: React.PointerEvent) {
        const origin = start.current;
        if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 8) cancel();
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onContextMenu(event: React.MouseEvent) {
        // Stop the touch callout menu from hijacking long-press.
        if (fired.current) event.preventDefault();
      },
    }),
    [cancel, onLongPress],
  );

  const consumeClick = useCallback(() => {
    if (!fired.current) return false;
    fired.current = false;
    return true;
  }, []);

  return { handlers, consumeClick };
}
