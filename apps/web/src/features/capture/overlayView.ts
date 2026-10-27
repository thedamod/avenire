import type { CaptureOverlayState } from "@avenire/desktop/bridge";

/** Main may set `closing` to ask for the exit animation before it hides the window. */
export type OverlayState = CaptureOverlayState & { readonly closing?: boolean };

/**
 * What the overlay window shows. `entry` bumps on every entrance, so the panel remounts and its
 * `@starting-style` enter plays again; leaving mid-exit back to open just retargets the transition.
 */
export interface OverlayView {
  readonly state: OverlayState | null;
  readonly shown: "hidden" | "open" | "closing";
  readonly entry: number;
  /**
   * Closed by the user (Undo, Open, Sources): later updates of this attempt don't reopen it.
   * Main's own exit (`closing`) is not a dismissal, so main taking it back reopens the panel.
   */
  readonly dismissedId?: string | undefined;
}

export type OverlayEvent =
  | { readonly type: "state"; readonly state: OverlayState }
  /** The overlay closes itself (Undo, Open, Sources). */
  | { readonly type: "close" }
  /** The exit finished, or main hid the window without one. */
  | { readonly type: "hidden" };

export const initialOverlayView: OverlayView = { state: null, shown: "hidden", entry: 0 };

/** The shortcut pressed again after a failure: a new attempt at the same pending capture. */
const isRetry = (previous: OverlayState | null, next: OverlayState) =>
  previous?.id === next.id &&
  previous.phase === "failed" &&
  (next.phase === "submitting" || next.phase === "collecting");

export function overlayView(view: OverlayView, event: OverlayEvent): OverlayView {
  switch (event.type) {
    case "state": {
      const { state } = event;
      // Hidden already: mount closed, so the exit timer still reports `dismissed`.
      if (state.closing) return { ...view, state, shown: "closing" };
      const dismissed = state.id === view.dismissedId && !isRetry(view.state, state);
      // Hidden stays hidden, and a user's exit plays out: the state still tracks, for the
      // next transition to compare against.
      if (dismissed || view.shown === "open") return { ...view, state };
      // A new capture, a retry, or main taking back its exit: enter (or turn around mid-exit).
      return {
        state,
        shown: "open",
        entry: view.shown === "hidden" ? view.entry + 1 : view.entry,
      };
    }
    case "close":
      return view.shown === "open"
        ? { ...view, shown: "closing", dismissedId: view.state?.id }
        : view;
    case "hidden":
      return view.shown === "hidden" ? view : { ...view, shown: "hidden" };
  }
}
