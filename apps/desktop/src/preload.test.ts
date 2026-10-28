import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { transform } from "esbuild";
import { expect, it, vi } from "vite-plus/test";

it.each([
  ["preload.ts", "avenire"],
  ["overlay-preload.ts", "avenireOverlay"],
])("%s executes in the Electron sandbox with Electron imports only", async (file, name) => {
  const source = await readFile(new URL(file!, import.meta.url), "utf8");
  const { code } = await transform(source, { loader: "ts", format: "cjs" });
  let exposed: any;
  const invoke = vi.fn(async () => undefined);
  const on = vi.fn();
  const removeListener = vi.fn();
  const info = vi.fn();
  runInNewContext(code, {
    process: { platform: "win32", argv: ["--avenire-capture-overlay"] },
    console: { info },
    require: (id: string) => {
      expect(id).toBe("electron");
      return {
        contextBridge: {
          exposeInMainWorld: (key: string, value: any) => {
            expect(key).toBe(name);
            exposed = value;
          },
        },
        ipcRenderer: { invoke, on, removeListener },
      };
    },
  });
  expect(exposed.platform).toBe("win32");
  if (name === "avenire") {
    expect(exposed.captureOverlay).toBe(true);
    const diagnostic = on.mock.calls.find(
      ([channel]) => channel === "avenire:capture-diagnostic",
    )![1];
    diagnostic({}, { stage: "Started", tabs: 4, extension: true });
    expect(info).toHaveBeenCalledWith("[capture]", { stage: "Started", tabs: 4, extension: true });
    await exposed.reportCaptureReceipt("capture", { files: [], skipped: [], blocked: [] });
    expect(invoke).toHaveBeenLastCalledWith("avenire:capture-receipt", "capture", {
      files: [],
      skipped: [],
      blocked: [],
    });
    const stop = exposed.onCaptureAction(vi.fn());
    stop();
    expect(removeListener).toHaveBeenLastCalledWith("avenire:capture-action", expect.any(Function));
  } else {
    const stop = exposed.onState(vi.fn());
    expect(invoke).toHaveBeenLastCalledWith("avenire:overlay-ready");
    stop();
    expect(removeListener).toHaveBeenLastCalledWith("avenire:overlay-state", expect.any(Function));
    await exposed.open("file");
    expect(invoke).toHaveBeenLastCalledWith("avenire:overlay-open", "file");
  }
  // The build's sandbox check supplies platform only.
  runInNewContext(code, {
    process: { platform: "linux" },
    require: () => ({
      contextBridge: { exposeInMainWorld() {} },
      ipcRenderer: { invoke, on, removeListener },
    }),
  });
});
