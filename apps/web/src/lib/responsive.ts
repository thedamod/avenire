"use client";

import { useSyncExternalStore } from "react";

/** Matches Tailwind's `md` breakpoint: below it the phone layout applies. */
const PHONE_QUERY = "(max-width: 767.98px)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True below the `md` breakpoint. Prefer CSS breakpoints; use this only for structural switches. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

/** True on touch-first devices, where long-press selects instead of hover actions. */
export function useIsTouch(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(pointer: coarse)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );
}
