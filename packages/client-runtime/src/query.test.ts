import { expect, it, vi } from "vite-plus/test";
import { QueryRequest } from "./query.ts";

it("aborts replaced loads and prevents late success or failure from publishing", async () => {
  const request = new QueryRequest();
  let resolveOld!: (value: string) => void;
  let oldSignal!: AbortSignal;
  const publish = { start: vi.fn(), success: vi.fn(), error: vi.fn(), finish: vi.fn() };
  const old = request.run((signal) => {
    oldSignal = signal;
    return new Promise<string>((resolve) => {
      resolveOld = resolve;
    });
  }, publish);
  await request.run(async () => "new", publish);
  resolveOld("stale");
  await old;
  expect(oldSignal.aborted).toBe(true);
  expect(publish.success.mock.calls).toEqual([["new"]]);
  expect(publish.finish).toHaveBeenCalledTimes(1);
  let rejectLate!: (error: unknown) => void;
  const late = request.run(
    () =>
      new Promise<string>((_, reject) => {
        rejectLate = reject;
      }),
    publish,
  );
  request.cancel();
  rejectLate(new Error("cancelled"));
  await late;
  expect(publish.error).not.toHaveBeenCalled();
  expect(publish.finish).toHaveBeenCalledTimes(1);
});
