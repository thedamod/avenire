import { describe, expect, it, vi } from "vite-plus/test";
import { NativePresentationTracker, nativePresentationFallback } from "./nativePresentation.ts";

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("native presentation acknowledgements", () => {
  it("does not dispatch a queued command after its turn closes", async () => {
    const tracker = new NativePresentationTracker();
    const execute = vi.fn(async () => {});
    tracker.apply("old:tool", execute, vi.fn());
    tracker.reset();
    await settle();
    expect(execute).not.toHaveBeenCalled();
  });
  it("keeps a delayed request pending across repeated streamed outputs until acknowledged", async () => {
    const tracker = new NativePresentationTracker();
    let acknowledge!: () => void;
    const execute = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          acknowledge = resolve;
        }),
    );
    const failed = vi.fn();
    tracker.apply("capture:tool", execute, failed);
    await settle();
    tracker.apply("capture:tool", execute, failed);
    expect(tracker.state("capture:tool")).toBe("pending");
    expect(execute).toHaveBeenCalledTimes(1);
    acknowledge();
    await settle();
    expect(tracker.state("capture:tool")).toBe("applied");
    expect(failed).not.toHaveBeenCalled();
  });

  it("reports IPC failure after capture and never replays an uncertain command", async () => {
    const tracker = new NativePresentationTracker();
    const execute = vi.fn(async () => {
      throw new Error("Native process exited");
    });
    const failed = vi.fn();
    tracker.apply("capture:tool", execute, failed);
    await settle();
    expect(tracker.state("capture:tool")).toBe("failed");
    tracker.apply("capture:tool", execute, failed);
    await settle();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it("ignores acknowledgements and failures from a closed capture session", async () => {
    const tracker = new NativePresentationTracker();
    let reject!: (error: Error) => void;
    const failed = vi.fn();
    tracker.apply(
      "old:tool",
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
      failed,
    );
    await settle();
    tracker.reset();
    reject(new Error("closed"));
    await settle();
    expect(tracker.state("old:tool")).toBeUndefined();
    expect(failed).not.toHaveBeenCalled();
  });

  it("preserves a pending explanation when invalidation precedes IPC rejection", async () => {
    const tracker = new NativePresentationTracker();
    let reject!: (error: Error) => void;
    const failed = vi.fn();
    tracker.apply(
      "capture:tool",
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
      failed,
    );
    await settle();
    tracker.invalidate();
    expect(failed).toHaveBeenCalledTimes(1);
    reject(new Error("process exited"));
    await settle();
    expect(failed).toHaveBeenCalledTimes(1);
    expect(tracker.state("capture:tool")).toBeUndefined();
  });

  it("retains annotation explanations and diagram parameters as a text fallback", () => {
    expect(nativePresentationFallback({ items: [{ text: "Biceps flex the elbow" }, {}] })).toBe(
      "Biceps flex the elbow",
    );
    expect(
      nativePresentationFallback({
        diagram: { title: "Cart pole", angleDegrees: 15, cartPosition: 0.2, poleLength: 1 },
      }),
    ).toContain("pole angle 15°");
    expect(nativePresentationFallback({ items: [] })).toContain("could not be shown");
  });
});
