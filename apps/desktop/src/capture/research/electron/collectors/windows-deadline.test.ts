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
it("resolves known documents after EnumWindows behind 1.2s Office, 0.5s Recent and 1.3s SMTC jobs", async () => {
  vi.useFakeTimers();
  try {
    const ctx = createCaptureContext([], 9000);
    mocks.run.mockImplementation(async (script: string, timeout: number) => {
      const duration =
        ({ Office: 1200, Recent: 500, SMTC: 1300 } as Record<string, number>)[script] ?? 100;
      expect(timeout).toBeGreaterThanOrEqual(duration);
      await new Promise((resolve) => setTimeout(resolve, duration));
      return {
        stdout: script.includes("CaptureWindows")
          ? "::WIN:: 4\tWINWORD\tLecture.docx"
          : script.includes("Word.Application")
            ? "::DOC:: Word\tC:\\Users\\student\\Lecture.docx"
            : "",
        stderr: "",
      };
    });
    const jobs = ["Office", "Recent", "SMTC"].map((script) =>
      execPowerShell(script, { timeout: 2500, deadline: ctx.deadline }),
    );
    const work = getBackgroundWindowsWindows(undefined, ctx.notes, ctx);
    await vi.advanceTimersByTimeAsync(4000);
    await Promise.all(jobs);
    expect(await work).toContainEqual({
      appName: "WINWORD",
      windowTitle: "Lecture.docx",
      filePath: "C:\\Users\\student\\Lecture.docx",
    });
  } finally {
    vi.useRealTimers();
  }
});
it("omits enumerated windows when no file resolves before the shared deadline", async () => {
  vi.useFakeTimers();
  try {
    const ctx = createCaptureContext([], 2500);
    mocks.run.mockImplementation(async (script: string) => {
      if (script.includes("CaptureWindows"))
        return { stdout: "::WIN:: 4\tWINWORD\tLecture.docx", stderr: "" };
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return { stdout: "", stderr: "" };
    });
    const work = getBackgroundWindowsWindows(undefined, ctx.notes, ctx);
    await vi.advanceTimersByTimeAsync(2501);
    expect(ctx.partialWindows).toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await work).toEqual([]);
  } finally {
    vi.useRealTimers();
  }
});
