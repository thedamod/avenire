import { expect, it, vi } from "vite-plus/test";
import { execPowerShell, prewarmPowerShell } from "./ps-queue.ts";
const mocks = vi.hoisted(() => ({
  run: vi.fn<
    (
      _script: string,
      _timeout: number,
      _maxBuffer: number,
    ) => Promise<{ stdout: string; stderr: string }>
  >(),
}));
vi.mock("./ps-host.ts", () => ({
  psHostManager: { usable: true, run: mocks.run, drainNotes: vi.fn() },
  isHostDeath: () => false,
  buildUtf8Prelude: () => "",
  PS_FLAGS: [],
}));

it("includes time spent waiting in the serial gate in the overall request deadline", async () => {
  let finish!: (value: { stdout: string; stderr: string }) => void;
  mocks.run.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const first = execPowerShell("first", { timeout: 1000 });
  const evaluate = vi.fn(() => "second");
  const second = execPowerShell(evaluate, { timeout: 15 });
  await expect(second).rejects.toThrow("timed out");
  expect(evaluate).not.toHaveBeenCalled();
  finish({ stdout: "done", stderr: "" });
  await first;
  // Drain the expired queued call: it must never run a late native operation.
  await Promise.resolve();
  await Promise.resolve();
  expect(mocks.run).toHaveBeenCalledOnce();
});

it("does not restart the deadline when a host failure would require retry/backoff", async () => {
  mocks.run.mockRejectedValue(Object.assign(new Error("host died"), { code: 1, stderr: "" }));
  const start = performance.now();
  await expect(execPowerShell("retry", { timeout: 100 })).rejects.toThrow("host died");
  expect(mocks.run).toHaveBeenCalledOnce();
  expect(performance.now() - start).toBeLessThan(200);
});

it("prewarms the persistent Windows host and foreground type through the same gate", async () => {
  const original = Object.getOwnPropertyDescriptor(process, "platform")!;
  Object.defineProperty(process, "platform", { value: "win32", configurable: true });
  mocks.run.mockResolvedValue({ stdout: "Preview\nStudy\n123", stderr: "" });
  try {
    await prewarmPowerShell();
    expect(mocks.run).toHaveBeenCalledOnce();
    const [script, timeout] = mocks.run.mock.calls[0]!;
    expect(script).toContain("GetForegroundWindow");
    expect(script).toContain("Add-Type");
    expect(timeout).toBeGreaterThan(0);
    expect(timeout).toBeLessThanOrEqual(4000);
  } finally {
    Object.defineProperty(process, "platform", original);
  }
});

it("prioritizes enumeration and separates shared queue deadline from command execution caps", async () => {
  vi.useFakeTimers();
  const order: string[] = [];
  mocks.run.mockImplementation(async (script, timeout) => {
    order.push(script);
    const duration = (
      { Office: 1200, Recent: 500, SMTC: 1300, EnumWindows: 100 } as Record<string, number>
    )[script]!;
    expect(timeout).toBeGreaterThanOrEqual(duration);
    await new Promise((resolve) => setTimeout(resolve, duration));
    return { stdout: script === "EnumWindows" ? "::WIN:: 4\tReader\tStudy" : "", stderr: "" };
  });
  const deadline = Date.now() + 9000;
  const jobs = [
    execPowerShell("Office", { timeout: 2500, deadline }),
    execPowerShell("Recent", { timeout: 1800, deadline }),
    execPowerShell("SMTC", { timeout: 2500, deadline }),
    execPowerShell("EnumWindows", { timeout: 2500, deadline, priority: 100 }),
  ];
  await vi.advanceTimersByTimeAsync(3200);
  expect((await Promise.all(jobs))[3]?.stdout).toContain("Study");
  expect(order[0]).toBe("EnumWindows");
  vi.useRealTimers();
});
