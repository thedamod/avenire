import { EventEmitter } from "node:events";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, expect, it, vi } from "vite-plus/test";
const state = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: state.spawn }));
import { NativeOverlay, loadNativeOverlayConfig } from "./native-overlay.ts";
function processFixture() {
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exitCode: null,
    signalCode: null,
    kill: vi.fn(),
    stdin: new Writable({
      write(chunk, _encoding, done) {
        const request = JSON.parse(String(chunk));
        queueMicrotask(() =>
          child.stdout.write(
            JSON.stringify({ id: request.id, ok: true, result: { screens: [] } }) + "\n",
          ),
        );
        done();
      },
    }),
  });
  state.spawn.mockReturnValue(child);
  return child;
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
it("enables an installed companion outside Wayland and preserves explicit disable", () => {
  vi.unstubAllEnvs();
  const root = mkdtempSync(join(tmpdir(), "avenire-native-test-"));
  mkdirSync(join(root, "native-dist"));
  writeFileSync(
    join(
      root,
      "native-dist",
      process.platform === "win32" ? "avenire-overlay.exe" : "avenire-overlay",
    ),
    "fixture",
  );
  try {
    expect(
      loadNativeOverlayConfig({
        packaged: false,
        resourcesPath: root,
        appPath: root,
        wayland: false,
      }).enabled,
    ).toBe(true);
    vi.stubEnv("AVENIRE_NATIVE_OVERLAY_ENABLED", "false");
    expect(
      loadNativeOverlayConfig({
        packaged: false,
        resourcesPath: "/tmp",
        appPath: "/tmp",
        wayland: true,
      }).enabled,
    ).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
it("reports terminal process failure once and a new explicit session can start", async () => {
  vi.useFakeTimers();
  const child = processFixture();
  const failure = vi.fn();
  const native = new NativeOverlay(
    { enabled: true, executable: process.execPath },
    undefined,
    undefined,
    failure,
  );
  await native.request("inspect");
  child.emit("exit");
  expect(native.available).toBe(false);
  expect(failure).toHaveBeenCalledOnce();
  await expect(native.request("inspect")).rejects.toThrow("closed");
  child.emit("error", new Error("late error"));
  expect(failure).toHaveBeenCalledOnce();
  processFixture();
  const replacement = new NativeOverlay({ enabled: true, executable: process.execPath });
  await expect(replacement.request("inspect")).resolves.toEqual({ screens: [] });
  replacement.dispose();
  vi.runOnlyPendingTimers();
});
it("times out a silent child and never replays the uncertain command", async () => {
  vi.useFakeTimers();
  const child = processFixture();
  const failure = vi.fn();
  const native = new NativeOverlay(
    { enabled: true, executable: process.execPath },
    undefined,
    undefined,
    failure,
  );
  await native.request("inspect");
  child.stdin = new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
  const result = native.request("annotate", { items: [] });
  const rejection = expect(result).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(8000);
  await rejection;
  expect(failure).toHaveBeenCalledOnce();
  expect(native.available).toBe(false);
});
