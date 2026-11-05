import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { isAbsolute, join, resolve } from "node:path";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

import type {
  DesktopOverlayState,
  DesktopOverlayAnnotation,
  DesktopScreenObservation,
  DesktopPromptCaptureContext,
} from "@avenire/contracts";
export type OverlayState = DesktopOverlayState;
export type OverlayAnnotation = DesktopOverlayAnnotation;
export type OverlayCapture = DesktopScreenObservation;
export type PromptCaptureContext = DesktopPromptCaptureContext;
export interface NativeOverlayConfig {
  readonly enabled: boolean;
  readonly executable: string;
}

/** Explicit operator configuration; renderer/model input never controls executable or argv. */
export function loadNativeOverlayConfig(paths: {
  readonly packaged: boolean;
  readonly resourcesPath: string;
  readonly appPath: string;
}): NativeOverlayConfig {
  const configured = Effect.runSync(
    Config.all({
      enabled: Config.Boolean("AVENIRE_NATIVE_OVERLAY_ENABLED").pipe(Config.withDefault(false)),
      executable: Config.String("AVENIRE_NATIVE_OVERLAY_EXECUTABLE").pipe(Config.withDefault("")),
    }),
  );
  const filename = process.platform === "win32" ? "avenire-overlay.exe" : "avenire-overlay";
  // appPath is the desktop package root in development; never depend on the invoking cwd.
  return {
    enabled: configured.enabled,
    executable:
      configured.executable ||
      (paths.packaged
        ? join(paths.resourcesPath, "native-overlay", filename)
        : resolve(paths.appPath, "native-dist", filename)),
  };
}

const MAX_FRAME = 1024 * 1024 + 4096;
const RESPONSE_TIMEOUT = 8000;
type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** One bounded stdio session. Disposing cancels startup and all outstanding requests. */
export class NativeOverlay {
  private child: ChildProcessWithoutNullStreams | undefined;
  private starting?: Promise<void>;
  private disposed = false;
  private sequence = 0;
  private buffer = Buffer.alloc(0);
  private pending = new Map<number, Pending>();
  private readonly config: NativeOverlayConfig;
  private readonly onDismiss: (() => void) | undefined;
  constructor(config: NativeOverlayConfig, onDismiss?: () => void) {
    this.config = config;
    this.onDismiss = onDismiss;
  }

  private start(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error("Native overlay session closed"));
    if (this.starting) return this.starting;
    if (!this.config.enabled || !isAbsolute(this.config.executable))
      return Promise.reject(
        new Error("Native overlay requires enabled configuration and an absolute executable path"),
      );
    this.child = spawn(this.config.executable, [], {
      shell: false,
      stdio: "pipe",
      windowsHide: true,
    });
    const child = this.child;
    child.stdout.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      let end: number;
      while ((end = this.buffer.indexOf(10)) !== -1) {
        if (end > MAX_FRAME) return this.fail(new Error("Native overlay response exceeded limit"));
        const line = this.buffer.subarray(0, end).toString("utf8");
        this.buffer = this.buffer.subarray(end + 1);
        try {
          const response = JSON.parse(line);
          if (response.event === "dismiss") {
            this.onDismiss?.();
            continue;
          }
          const pending = this.pending.get(response.id);
          if (!pending) continue;
          if (typeof response.ok !== "boolean") throw new Error("Invalid native overlay response");
          clearTimeout(pending.timer);
          this.pending.delete(response.id);
          if (response.ok) pending.resolve(response.result);
          else
            pending.reject(
              new Error(
                typeof response.error?.message === "string"
                  ? response.error.message.slice(0, 500)
                  : "Native overlay request failed",
              ),
            );
        } catch {
          this.fail(new Error("Invalid native overlay protocol"));
          return;
        }
      }
      if (this.buffer.length > MAX_FRAME)
        this.fail(new Error("Native overlay response exceeded limit"));
    });
    // Drain diagnostic output without retaining screen content or unbounded logs.
    child.stderr.resume();
    child.on("error", () => this.fail(new Error("Native overlay could not start")));
    child.stdin.on("error", () => this.fail(new Error("Native overlay input closed")));
    child.on("exit", () => this.fail(new Error("Native overlay exited")));
    this.starting = this.send("inspect", {}).then(() => undefined);
    return this.starting;
  }

  private send(method: string, params: object): Promise<unknown> {
    if (this.disposed || !this.child)
      return Promise.reject(new Error("Native overlay session closed"));
    if (this.pending.size >= 32) return Promise.reject(new Error("Native overlay is busy"));
    const id = ++this.sequence;
    const frame = JSON.stringify({ id, method, params }) + "\n";
    if (Buffer.byteLength(frame) > MAX_FRAME)
      return Promise.reject(new Error("Native overlay request exceeded limit"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => this.fail(new Error(`Native overlay ${method} timed out`)),
        RESPONSE_TIMEOUT,
      );
      this.pending.set(id, { resolve, reject, timer });
      this.child!.stdin.write(frame);
    });
  }

  async request(
    method:
      | "inspect"
      | "show"
      | "hide"
      | "set_state"
      | "annotate"
      | "clear"
      | "visualize"
      | "capture",
    params: object = {},
  ): Promise<unknown> {
    await this.start();
    return this.send(method, params);
  }

  async capture(screenId?: string): Promise<OverlayCapture> {
    const result = await this.request("capture", screenId ? { screenId } : {});
    if (!result || typeof result !== "object") throw new Error("Invalid native capture");
    const value = result as OverlayCapture;
    if (
      value.mimeType !== "image/png" ||
      typeof value.data !== "string" ||
      value.data.length > 1024 * 1024 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(value.data) ||
      !value.data.startsWith("iVBORw0KGgo") ||
      !Number.isInteger(value.width) ||
      value.width <= 0 ||
      value.width > 32768 ||
      !Number.isInteger(value.height) ||
      value.height <= 0 ||
      value.height > 32768 ||
      typeof value.screenId !== "string" ||
      typeof value.capturedAt !== "string"
    )
      throw new Error("Invalid native capture");
    return value;
  }

  private fail(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.dispose();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.buffer = Buffer.alloc(0);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Native overlay session closed"));
    }
    this.pending.clear();
    const child = this.child;
    this.child = undefined;
    if (child && child.exitCode === null && child.signalCode === null) {
      child.stdin.end(
        JSON.stringify({ id: ++this.sequence, method: "shutdown", params: {} }) + "\n",
      );
      const kill = setTimeout(() => child.kill("SIGKILL"), 500);
      kill.unref();
      child.once("exit", () => clearTimeout(kill));
    }
  }
}
