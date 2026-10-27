import { describe, expect, it } from "vite-plus/test";
import {
  initialOverlayView,
  overlayView,
  type OverlayState,
  type OverlayView,
} from "./overlayView";

const state = (id: string, extra: Partial<OverlayState> = {}): OverlayState => ({
  id,
  phase: "collecting",
  items: [],
  ...extra,
});
const run = (...events: Parameters<typeof overlayView>[1][]) =>
  events.reduce<OverlayView>(overlayView, initialOverlayView);

describe("capture overlay view", () => {
  it("enters on the first state and keeps updating while open", () => {
    const view = run(
      { type: "state", state: state("a") },
      { type: "state", state: state("a", { phase: "done" }) },
    );
    expect(view).toMatchObject({ shown: "open", entry: 1, state: { phase: "done" } });
  });

  it("exits when main sets closing, then re-enters for the next capture", () => {
    let view = run(
      { type: "state", state: state("a") },
      { type: "state", state: state("a", { closing: true }) },
    );
    expect(view.shown).toBe("closing");
    view = overlayView(view, { type: "hidden" });
    expect(view.shown).toBe("hidden");
    view = overlayView(view, { type: "state", state: state("b") });
    expect(view).toMatchObject({ shown: "open", entry: 2, state: { id: "b" } });
  });

  it("stays closed for a capture the user closed, even as its updates arrive", () => {
    let view = run({ type: "state", state: state("a") }, { type: "close" });
    expect(view.shown).toBe("closing");
    view = overlayView(view, { type: "state", state: state("a", { phase: "done" }) });
    expect(view).toMatchObject({ shown: "closing", state: { phase: "done" } });
    view = overlayView(view, { type: "hidden" });
    view = overlayView(view, { type: "state", state: state("a", { phase: "done" }) });
    expect(view.shown).toBe("hidden");
  });

  it("turns around mid-exit for a new capture without remounting", () => {
    const view = run(
      { type: "state", state: state("a") },
      { type: "close" },
      { type: "state", state: state("b") },
    );
    expect(view).toMatchObject({ shown: "open", entry: 1, state: { id: "b" } });
  });

  it("mounts closed when main asks to close while hidden, so dismissed still fires", () => {
    const view = run({ type: "state", state: state("a", { closing: true }) });
    expect(view.shown).toBe("closing");
  });
});
