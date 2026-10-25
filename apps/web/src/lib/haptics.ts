"use client";

export type HapticKind = "selection" | "success" | "error";

const patterns: Record<HapticKind, number | number[]> = {
  selection: 12,
  success: [12, 30, 18],
  error: [24, 40, 24],
};
let lastFeedback = -Infinity;

/** Optional feedback must never interrupt an action, including in unsupported browsers. */
export function hapticFeedback(kind: HapticKind = "selection"): void {
  if (typeof window === "undefined" || document.visibilityState === "hidden") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const now = performance.now();
  if (now - lastFeedback < 50) return;
  try {
    const native = (
      window as Window & {
        ReactNativeWebView?: { postMessage: (message: string) => void };
      }
    ).ReactNativeWebView;
    if (native) {
      // eslint-disable-next-line unicorn/require-post-message-target-origin -- This is React Native's one-argument bridge, not Window.postMessage.
      native.postMessage(JSON.stringify({ type: "avenire:haptic", kind }));
      lastFeedback = now;
    } else if (
      (navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches) &&
      typeof navigator.vibrate === "function"
    ) {
      navigator.vibrate(patterns[kind]);
      lastFeedback = now;
    }
  } catch {
    // Device settings and browser policies can deny vibration; the action still succeeds.
  }
}
