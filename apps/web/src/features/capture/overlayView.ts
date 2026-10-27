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
  /** Closed by the user (an action, or main's hide): later updates for it don't reopen it. */
  readonly dismissedId?: string | undefined;
}

export type OverlayEvent =
  | { readonly type: "state"; readonly state: OverlayState }
  /** The overlay closes itself (Undo, Open, Sources). */
  | { readonly type: "close" }
  /** The exit finished, or main hid the window without one. */
  | { readonly type: "hidden" };

export const initialOverlayView: OverlayView = { state: null, shown: "hidden", entry: 0 };

export function overlayView(view: OverlayView, event: OverlayEvent): OverlayView {
  switch (event.type) {
    case "state": {
      const { state } = event;
      if (state.closing) {
        // Hidden already: mount closed, so the exit timer still reports `dismissed`.
        return { ...view, state, shown: "closing", dismissedId: state.id };
      }
      if (view.shown === "open") return { ...view, state };
      if (state.id === view.dismissedId)
        return view.shown === "closing" ? { ...view, state } : view;
      // A new capture: enter (or turn around mid-exit).
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
      return view.shown === "hidden"
        ? view
        : { ...view, shown: "hidden", dismissedId: view.state?.id };
  }
}
