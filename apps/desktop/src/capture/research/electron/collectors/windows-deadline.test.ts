import { expect, it, vi } from "vite-plus/test";
const mocks = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("./ps-host.ts", () => ({
  psHostManager: { usable: true, run: mocks.run, drainNotes: vi.fn() },
  isHostDeath: () => false,
  buildUtf8Prelude: () => "",
  PS_FLAGS: [],
}));
vi.mock("./handle-scan-win.ts", () => ({ requestProcessScan: async () => [] }));
import { execPowerShell } from "./ps-queue.ts";
import { createCaptureContext } from "./capture-context.ts";
import { getBackgroundWindowsWindows } from "./background-windows-win.ts";
it("retains EnumWindows behind 1.2s Office, 0.5s Recent and 1.3s SMTC jobs", async () => {
  vi.useFakeTimers();
  try {
    const ctx = createCaptureContext([], 9000);
    mocks.run.mockImplementation(async (script: string, timeout: number) => {
      const duration =
        ({ Office: 1200, Recent: 500, SMTC: 1300 } as Record<string, number>)[script] ?? 100;
      expect(timeout).toBeGreaterThanOrEqual(duration);
      await new Promise((resolve) => setTimeout(resolve, duration));
      return {
        stdout: script.includes("CaptureWindows") ? "::WIN:: 4\tStudyApp\tLecture window" : "",
        stderr: "",
      };
    });
    const jobs = ["Office", "Recent", "SMTC"].map((script) =>
      execPowerShell(script, { timeout: 2500, deadline: ctx.deadline }),
    );
    const work = getBackgroundWindowsWindows(undefined, ctx.notes, ctx);
    await vi.advanceTimersByTimeAsync(4000);
    await Promise.all(jobs);
    expect(await work).toContainEqual({ appName: "StudyApp", windowTitle: "Lecture window" });
  } finally {
    vi.useRealTimers();
  }
});
it("keeps enumerated titles if enrichment fails at the shared deadline", async () => {
  vi.useFakeTimers();
  try {
    const ctx = createCaptureContext([], 2500);
    mocks.run.mockImplementation(async (script: string) => {
      if (script.includes("CaptureWindows"))
        return { stdout: "::WIN:: 4\tStudyApp\tLecture window", stderr: "" };
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return { stdout: "", stderr: "" };
    });
    const work = getBackgroundWindowsWindows(undefined, ctx.notes, ctx);
    await vi.advanceTimersByTimeAsync(2501);
    expect(ctx.partialWindows).toContainEqual({
      appName: "StudyApp",
      windowTitle: "Lecture window",
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await work).toContainEqual({ appName: "StudyApp", windowTitle: "Lecture window" });
  } finally {
    vi.useRealTimers();
  }
});
