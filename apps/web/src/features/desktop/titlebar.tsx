"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** DesktopFrame's title bar regions; set only while `<html data-desktop-chrome>` is present. */
export interface TitlebarSlots {
  readonly start: HTMLElement;
  readonly end: HTMLElement;
}

let current: TitlebarSlots | null = null;
const listeners = new Set<() => void>();

export function setTitlebarSlots(next: TitlebarSlots | null) {
  if (next?.start === current?.start && next?.end === current?.end) return;
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/**
 * Null on the server, during hydration and in the browser, so callers render their in-page header
 * there. In a desktop window it switches to the slots right after hydration; CSS hides the
 * in-page row before first paint (`data-desktop-header`), so nothing shifts.
 */
export function useTitlebarSlots() {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}

/** Renders breadcrumbs at the start of the title bar and page actions beside the caption buttons. */
export function DesktopTitlebar({
  slots,
  start,
  end,
}: {
  slots: TitlebarSlots;
  start?: ReactNode;
  end?: ReactNode;
}) {
  return (
    <>
      {start ? createPortal(start, slots.start) : null}
      {end ? createPortal(end, slots.end) : null}
    </>
  );
}
