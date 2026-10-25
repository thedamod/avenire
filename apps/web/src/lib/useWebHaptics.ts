"use client";

import { useEffect } from "react";
import { hapticFeedback, type HapticKind } from "./haptics";

/** One delegated listener covers buttons, tabs, menus and links, including portaled sheets. */
export function useWebHaptics() {
  useEffect(() => {
    let lastTouch: { target: EventTarget | null; at: number } | undefined;
    const pointer = (event: PointerEvent) => {
      lastTouch =
        event.pointerType === "touch" ? { target: event.target, at: performance.now() } : undefined;
    };
    const click = (event: MouseEvent) => {
      if (!event.isTrusted || event.detail === 0 || !(event.target instanceof Element)) return;
      const pointerType = (event as PointerEvent).pointerType;
      const touch = pointerType
        ? pointerType === "touch"
        : Boolean(
            lastTouch &&
            performance.now() - lastTouch.at < 700 &&
            lastTouch.target instanceof Node &&
            (lastTouch.target === event.target || event.target.contains(lastTouch.target)),
          );
      lastTouch = undefined;
      if (
        !touch ||
        event.target.closest('[data-haptics="off"], [disabled], [aria-disabled="true"], [inert]')
      )
        return;
      const control = event.target.closest(
        'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="checkbox"], [role="radio"], [role="switch"], input[type="checkbox"], input[type="radio"]',
      );
      if (!control) return;
      const kind = control.getAttribute("data-haptics");
      hapticFeedback(kind === "success" || kind === "error" ? (kind as HapticKind) : "selection");
    };
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("click", click, true);
    return () => {
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("click", click, true);
    };
  }, []);
}
