/* eslint-disable no-await-in-loop -- Browser actions and diagnostics must run sequentially for action attribution. */
import { createHash, randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { kitsDir } from "@avenire/widget-kit/kits-dir";
import { WIDGET_RESPONSE_CSP } from "@avenire/ui/widget-protocol";
import { pngImage } from "../images.ts";
import { instrumentation } from "./instrumentation.ts";
import type { PreviewReport } from "./report.ts";

export interface RunnerInput {
  width: number;
  appearance: "light" | "dark";
  tokens: Readonly<Record<string, string>>;
  requireWebGL?: boolean;
  document: (origin: string) => Promise<string>;
}
export type PreviewRunner = (input: RunnerInput, signal: AbortSignal) => Promise<PreviewReport>;
type Mutable<T> =
  T extends ReadonlyArray<infer U>
    ? Mutable<U>[]
    : T extends object
      ? { -readonly [K in keyof T]: Mutable<T[K]> }
      : T;
type Json = Record<string, unknown>;
type Measure = {
  text: string;
  frames: number;
  errors: PreviewReport["errors"];
  contentHeight: number;
  overflowX: boolean;
  nonfinite: boolean;
  rendering: NonNullable<PreviewReport["rendering"]>;
};
type Control = {
  selector: string;
  role: string;
  name: string;
  tag: string;
  type: string;
  min: string;
  max: string;
  step: string;
  checked: boolean;
  disabled: boolean;
  focusable: boolean;
  pointer: boolean;
  draggable: boolean;
  options: string[];
};
const object = (value: unknown): Json =>
  typeof value === "object" && value !== null ? (value as Json) : {};
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Chrome can detach from the CLI/daemon. The unique profile root still proves ownership. */
export const ownedPreviewPids = (listing: string, directory: string, daemon: number): number[] => {
  const rows = listing.split("\n").flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    return match ? [{ pid: Number(match[1]), parent: Number(match[2]), args: match[3]! }] : [];
  });
  const pids = new Set<number>();
  if (daemon > 0) pids.add(daemon);
  for (const row of rows)
    if (
      row.args
        .split(/\s+/)
        .some((arg) => arg.startsWith(`--user-data-dir=${directory}/agent-browser-chrome-`))
    )
      pids.add(row.pid);
  let count = -1;
  while (count !== pids.size) {
    count = pids.size;
    for (const row of rows) if (pids.has(row.parent)) pids.add(row.pid);
  }
  return [...pids].toReversed();
};

/** No shell and no inherited application credentials, providers, profiles or browser config. */
export function createLocalRunner(
  environment: Readonly<Record<string, string | undefined>>,
): PreviewRunner {
  const cli = join(
    dirname(
      createRequire(join(process.cwd(), "package.json")).resolve("agent-browser/package.json"),
    ),
    "bin/agent-browser.js",
  );
  return async (input, signal) => {
    const directory = await mkdtemp(join(tmpdir(), "avenire-preview-"));
    const session = `preview-${randomUUID()}`;
    const env = {
      ...environment,
      NODE_ENV: "production" as const,
      // agent-browser's transient Chrome profile also lives under our cleanup root.
      TMPDIR: directory,
      AGENT_BROWSER_SOCKET_DIR: directory,
      AGENT_BROWSER_DEFAULT_TIMEOUT: "2000",
    };
    const config = join(directory, "config.json");
    const init = join(directory, "init.js");
    await writeFile(config, "{}");
    await writeFile(init, instrumentation);
    const argv = [cli, "--config", config, "--session", session, "--json"];
    let deadline = performance.now() + 40_000;
    const command = (args: string[], cleanup = false): Promise<Json> =>
      new Promise((resolve, reject) => {
        const timeout = cleanup ? 2500 : Math.max(1, Math.min(6000, deadline - performance.now()));
        const child = spawn(process.execPath, [...argv, ...args], {
          cwd: directory,
          env,
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "",
          stderr = "",
          stopped = "";
        const kill = (reason: string) => {
          stopped = reason;
          if (child.pid) {
            try {
              process.kill(-child.pid, "SIGKILL");
            } catch (cause) {
              if (object(cause).code !== "ESRCH") reject(cause);
            }
          }
        };
        const timer = setTimeout(() => kill("timed out"), timeout);
        const abort = () => kill("aborted");
        if (!cleanup) {
          signal.addEventListener("abort", abort, { once: true });
          if (signal.aborted) abort();
        }
        child.stdout.on("data", (data) => {
          stdout += String(data);
          if (stdout.length > 2_000_000) kill("output limit exceeded");
        });
        child.stderr.on("data", (data) => {
          stderr = (stderr + String(data)).slice(-2000);
        });
        child.once("error", reject);
        child.once("close", (code) => {
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          if (code !== 0)
            return reject(
              new Error(
                `agent-browser ${args[0]}: ${stopped || `exit ${code}`} ${stdout.slice(0, 2000)} ${stderr.slice(0, 500)}`,
              ),
            );
          try {
            const result = object(JSON.parse(stdout));
            if (result.success !== true)
              return reject(new Error(`agent-browser ${args[0]}: ${String(result.error)}`));
            resolve(object(result.data));
          } catch (cause) {
            reject(cause);
          }
        });
      });
    const evaluate = async <T>(js: string): Promise<T> => {
      const data = await command(["eval", "-b", Buffer.from(js).toString("base64")]);
      return data.result as T;
    };
    // Same server also acts as a deny-by-default HTTP proxy for Chrome. The
    // domain allowlist alone allows other loopback ports; the proxy closes that gap.
    let origin = "",
      document = "";
    const server = createServer((req, res) => {
      void (async () => {
        const url = new URL(req.url ?? "/", origin);
        if (url.origin !== origin || req.method !== "GET") {
          res.writeHead(403).end();
          return;
        }
        const headers = {
          "Access-Control-Allow-Origin": "*",
          "Cross-Origin-Resource-Policy": "cross-origin",
          "Cache-Control": "no-store",
        };
        if (url.pathname === "/") {
          res
            .writeHead(200, {
              ...headers,
              "Content-Type": "text/html; charset=utf-8",
              "Content-Security-Policy": WIDGET_RESPONSE_CSP({
                kitsOrigin: origin,
                frameAncestors: [],
              }),
            })
            .end(document);
        } else if (/^\/kits\/[a-zA-Z0-9._-]+\.js$/.test(url.pathname)) {
          const bytes = await readFile(join(kitsDir, url.pathname.slice(6)));
          res
            .writeHead(200, { ...headers, "Content-Type": "text/javascript; charset=utf-8" })
            .end(bytes);
        } else res.writeHead(404).end();
      })().catch(() => {
        if (!res.headersSent) res.writeHead(404);
        res.end();
      });
    });
    server.on("connect", (_req, socket) => {
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    });
    server.on("upgrade", (_req, socket) => {
      socket.destroy();
    });
    let ownedPids: number[] = [];
    let pageStarted = false;
    const onExit = () => {
      for (const pid of ownedPids) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          /* Already exited. */
        }
      }
    };
    process.once("exit", onExit);
    const processTree = async () => {
      const daemon = Number(
        await readFile(join(directory, `${session}.pid`), "utf8").catch(() => "0"),
      );
      const listing = await new Promise<string>((resolve, reject) =>
        execFile("ps", ["-eo", "pid=,ppid=,args="], (e, out) => (e ? reject(e) : resolve(out))),
      );
      return ownedPreviewPids(listing, directory, daemon);
    };
    const report: Mutable<Omit<PreviewReport, "screenshot" | "consoleMessages">> = {
      ok: true,
      width: input.width,
      appearance: input.appearance,
      contentHeight: 0,
      overflowX: false,
      screenshots: [],
      console: [],
      errors: [],
      interactions: [],
      accessibility: [],
      summary: "",
    };
    const recordError = (kind: string, text: string, afterAction?: string) => {
      if (report.errors.length < 100)
        report.errors.push({
          kind,
          message: text.slice(0, 2000),
          ...(afterAction ? { afterAction } : {}),
        });
    };
    let consoleCount = 0,
      errorCount = 0,
      requestCount = 0;
    let previous: Measure | undefined;
    const collect = async (afterAction?: string) => {
      const tagged = afterAction ? { afterAction } : {};
      const measured = await evaluate<Measure>(
        `(async()=>{await new Promise(r=>setTimeout(r,140));return window.__avenirePreview.measure()})()`,
      );
      report.contentHeight = Math.max(report.contentHeight, measured.contentHeight);
      report.rendering = measured.rendering;
      report.overflowX ||= measured.overflowX;
      for (const error of measured.errors)
        if (report.errors.length < 100) report.errors.push({ ...error, ...tagged });
      if (measured.overflowX && !previous?.overflowX)
        recordError("overflow", "Content overflows the requested width", afterAction);
      if (measured.nonfinite && !previous?.nonfinite)
        recordError("nonfinite", "Visible readout contains NaN or Infinity", afterAction);
      if (previous && measured.frames <= previous.frames)
        recordError("freeze", "No requestAnimationFrame progress after interaction", afterAction);
      const logs = await command(["console"]);
      const entries = Array.isArray(logs.messages) ? logs.messages : [];
      for (const entry of entries.slice(consoleCount)) {
        const item = object(entry);
        if (report.console.length < 100)
          report.console.push({
            level: String(item.type ?? item.level ?? "log"),
            text: String(item.text ?? item.message ?? "").slice(0, 2000),
            source: String(item.url ?? item.source ?? "console"),
            ...tagged,
          });
      }
      consoleCount = entries.length;
      const captured = await command(["errors"]);
      const errors = Array.isArray(captured.errors) ? captured.errors : [];
      for (const entry of errors.slice(errorCount)) {
        const item = object(entry),
          text =
            typeof entry === "string"
              ? entry
              : String(item.message ?? item.text ?? JSON.stringify(entry));
        if (
          !report.errors.some(
            (e) =>
              e.afterAction === afterAction &&
              (e.stack === text ||
                e.message.replace(/^Uncaught /, "").split("\n")[0] ===
                  text.replace(/^Uncaught /, "").split("\n")[0]),
          )
        )
          recordError("exception", text, afterAction);
      }
      errorCount = errors.length;
      const network = await command(["network", "requests"]);
      const requests = Array.isArray(network.requests) ? network.requests : [];
      for (const entry of requests.slice(requestCount)) {
        const item = object(entry);
        if (
          item.error ||
          item.errorText ||
          item.failure ||
          item.failed ||
          Number(item.status ?? object(item.response).status) >= 400
        )
          recordError(
            "request",
            `${String(item.url)}: ${String(item.error ?? item.errorText ?? item.failure ?? item.status ?? object(item.response).status ?? "failed")}`,
            afterAction,
          );
      }
      requestCount = requests.length;
      const changedText = !!previous && previous.text !== measured.text;
      previous = measured;
      return changedText;
    };
    const screenshot = async (label: string) => {
      const path = join(directory, `state-${report.screenshots.length}.png`);
      // Bound pixel allocation even if a broken control creates a huge scroll area.
      await command([
        "set",
        "viewport",
        String(input.width),
        String(Math.max(40, Math.min(previous?.contentHeight ?? 600, 2400))),
      ]);
      await command(["screenshot", path]);
      const bytes = await readFile(path);
      report.screenshots.push({
        label,
        image: pngImage(bytes, {
          id: createHash("sha256").update(bytes).digest("hex").slice(0, 24),
          width: bytes.readUInt32BE(16),
          height: bytes.readUInt32BE(20),
        }),
      });
    };
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Preview listener has no port");
      origin = `http://127.0.0.1:${address.port}`;
      document = await input.document(origin);
      argv.push(
        "--headed",
        "false",
        "--engine",
        "chrome",
        "--allowed-domains",
        "127.0.0.1",
        "--proxy",
        origin,
        "--proxy-bypass",
        "<-loopback>",
        "--init-script",
        init,
        "--color-scheme",
        input.appearance,
        "--idle-timeout",
        "45s",
      );
      await command(["open"]);
      ownedPids = await processTree();
      await command(["set", "viewport", String(input.width), "600"]);
      await command(["network", "route", "*", "--abort", "--resource-type", "xhr,fetch"]);
      pageStarted = true;
      await command(["open", origin]);
      await command(["wait", "--load", "load"]);
      await evaluate(
        `window.postMessage(${JSON.stringify({ type: "avenire:theme", colorScheme: input.appearance, tokens: input.tokens })},'*')`,
      );
      await evaluate(
        `(async()=>{await Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,500))]);await new Promise(r=>setTimeout(r,300));return true})()`,
      );
      await collect();
      await screenshot("initial");
      const controls = await evaluate<Control[]>("window.__avenirePreview.controls()");
      // Reserve room for final diagnostics/cleanup. Exploration itself is <=20s.
      const explorationEnds = performance.now() + 20_000;
      deadline = Math.min(deadline, explorationEnds + 5000);
      let stop = false;
      for (const control of controls) {
        if (stop || signal.aborted) break;
        if (control.pointer && !control.draggable) continue;
        if (!control.pointer && (!control.name || !control.focusable))
          report.accessibility.push({
            ref: control.selector,
            message: !control.name
              ? "Control has no accessible label"
              : "Control is not keyboard focusable",
          });
        if (control.disabled) continue;
        const actions: { action: string; value?: string }[] = [];
        if (control.role === "button") actions.push({ action: "click" });
        else if (control.type === "range" || control.type === "number") {
          const min =
            control.min !== "" && Number.isFinite(Number(control.min)) ? Number(control.min) : 0;
          const max =
            control.max !== "" && Number.isFinite(Number(control.max)) ? Number(control.max) : 100;
          const step = control.step === "any" ? 0 : Number(control.step) || 1;
          const mid = step > 0 ? min + Math.round((max - min) / 2 / step) * step : (min + max) / 2;
          for (const [label, value] of [
            ["min", min],
            ["mid", mid],
            ["max", max],
          ] as const)
            actions.push({ action: `set ${label}`, value: String(value) });
        } else if (control.tag === "select")
          for (const value of control.options) actions.push({ action: "select", value });
        else if (
          control.role === "checkbox" ||
          control.role === "switch" ||
          control.type === "radio"
        )
          actions.push({ action: "toggle" });
        else if (control.draggable) actions.push({ action: "drag" });
        else if (
          control.role === "textbox" &&
          !["password", "file", "color", "date", "submit"].includes(control.type)
        )
          actions.push({
            action: "fill",
            value: control.type === "email" ? "preview@example.test" : "preview",
          });
        for (const item of actions) {
          if (report.interactions.length >= 25 || performance.now() >= explorationEnds) {
            stop = true;
            break;
          }
          const action = `${control.name || control.role}: ${item.action}${item.value !== undefined ? ` ${item.value}` : ""}`;
          const interaction: Mutable<PreviewReport["interactions"][number]> = {
            ...item,
            ref: control.selector,
            role: control.role,
            name: control.name,
            changedText: false,
          };
          const firstError = report.errors.length;
          try {
            // Refresh refs before every action; button captions/DOM may change.
            const tree = await command(["snapshot", "-i"]);
            const refs = object(tree.refs);
            const match = Object.entries(refs).find(([, value]) => {
              const r = object(value);
              return r.role === control.role && r.name === control.name;
            });
            if (match) interaction.ref = `@${match[0].replace(/^@/, "")}`;
            // Stable preview selector disambiguates controls with identical names.
            const selector = control.selector;
            if (item.action.startsWith("set ")) {
              await evaluate(
                `(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Control disappeared');el.focus();el.value=${JSON.stringify(item.value)};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`,
              );
            } else if (item.action === "select") await command(["select", selector, item.value!]);
            else if (item.action === "fill") await command(["fill", selector, item.value!]);
            else if (item.action === "drag") {
              const box = await evaluate<{ x: number; y: number }>(
                `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
              );
              await command(["mouse", "move", String(box.x), String(box.y)]);
              await command(["mouse", "down"]);
              await command(["mouse", "move", String(box.x + 30), String(box.y + 15)]);
              await command(["mouse", "up"]);
            } else await command(["click", selector]);
            interaction.changedText = await collect(action);
            if (report.errors.length > firstError)
              interaction.error = report.errors
                .slice(firstError)
                .map((e) => e.message)
                .join("; ")
                .slice(0, 2000);
            const meaningful =
              item.action === "set max" ||
              /play|run|step/i.test(control.name) ||
              !!interaction.error;
            if (meaningful && report.screenshots.length < 4) await screenshot(action);
          } catch (cause) {
            interaction.error = message(cause).slice(0, 2000);
            recordError("interaction", interaction.error, action);
            if (/timeout|timed out|abort/i.test(interaction.error)) {
              recordError(
                "freeze",
                "Browser did not respond; possible debugger pause or blocked main thread",
                action,
              );
              stop = true;
            }
          }
          report.interactions.push(interaction);
        }
      }
      if (!stop && report.screenshots.length < 3) await screenshot("final");
      if (stop)
        report.console.push({
          level: "warning",
          text: "Exploration stopped at the 25-action / 20-second budget or a browser timeout; remaining controls are unverified.",
          source: "preview",
        });
      if (report.accessibility.length)
        recordError(
          "accessibility",
          report.accessibility.map((e) => `${e.ref}: ${e.message}`).join("; "),
        );
      if (
        input.requireWebGL &&
        (!report.rendering ||
          report.rendering.webgl + report.rendering.webgl2 === 0 ||
          report.rendering.programsLinked === 0 ||
          report.rendering.drawCalls === 0)
      )
        recordError(
          "webgl",
          "WebGL was required, but no linked shader program submitted a draw. A Canvas 2D fallback does not satisfy this check.",
        );
      report.ok =
        report.errors.length === 0 &&
        !report.console.some((e) => ["error", "assert"].includes(e.level));
      const issues = [
        ...report.errors.map(
          (e) =>
            `${e.afterAction ? `after ${e.afterAction}: ` : ""}${e.kind}: ${e.message.slice(0, 250)}`,
        ),
        ...report.console
          .filter((e) => ["error", "assert"].includes(e.level))
          .map(
            (e) =>
              `${e.afterAction ? `after ${e.afterAction}: ` : ""}console: ${e.text.slice(0, 250)}`,
          ),
      ];
      report.summary = report.ok
        ? `Preview passed at ${input.width}px (${input.appearance}); ${report.interactions.length} interactions exercised. ${stop ? "Coverage is incomplete." : "No runtime errors or overflow detected."}`
        : `${issues.length} issue(s): ${issues.slice(0, 5).join("; ")}${stop ? "; coverage is incomplete" : ""}`;
      if (report.rendering) {
        const { canvas2d, webgl, webgl2, programsLinked, drawCalls } = report.rendering;
        report.summary +=
          webgl + webgl2 > 0
            ? ` Rendering: WebGL (${programsLinked} linked program(s), ${drawCalls} draw call(s)).`
            : canvas2d > 0
              ? " Rendering: Canvas 2D; no WebGL shader was rendered."
              : " Rendering: DOM/SVG; no WebGL context.";
      }
      let screenshotImage = report.screenshots[0]?.image;
      if (!screenshotImage?.data) throw new Error("Preview browser returned no screenshot");
      // images.ts accepts one image. Compose all labeled states into that image
      // and return small per-state references, preserving the owner's edit scope.
      let regionY = 0;
      const regions = report.screenshots.map((state) => {
        const region = {
          x: 0,
          y: regionY + 24,
          width: state.image.width,
          height: state.image.height,
        };
        regionY += state.image.height + 24;
        return region;
      });
      let sheet = screenshotImage;
      if (!stop && report.screenshots.length > 1 && deadline - performance.now() > 1500) {
        const escape = (text: string) =>
          text.replace(
            /[&<>"']/g,
            (char) =>
              ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
          );
        document = `<!doctype html><html><head><style>html,body{margin:0;width:${input.width}px;background:${input.appearance === "dark" ? "#171717" : "#fafafa"};color:${input.appearance === "dark" ? "#f5f5f5" : "#171717"}}img{display:block}header{box-sizing:border-box;height:24px;padding:4px 8px;font:12px monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}</style></head><body>${report.screenshots.map((state) => `<header>${escape(state.label)}</header><img width="${state.image.width}" height="${state.image.height}" src="data:image/png;base64,${state.image.data}">`).join("")}</body></html>`;
        await command(["open", origin]);
        await command(["wait", "--load", "load"]);
        const path = join(directory, "contact-sheet.png");
        await command(["screenshot", "--full", path]);
        const bytes = await readFile(path);
        sheet = pngImage(bytes, {
          id: createHash("sha256").update(bytes).digest("hex").slice(0, 24),
          width: bytes.readUInt32BE(16),
          height: bytes.readUInt32BE(20),
        });
      } else {
        // A frozen page cannot compose new images; its initial capture remains useful.
        report.screenshots.splice(1);
        regions[0] = { x: 0, y: 0, width: sheet.width, height: sheet.height };
      }
      screenshotImage = sheet;
      report.screenshots = report.screenshots.map((state, i) => {
        const { data: _data, ...metadata } = state.image;
        return { ...state, image: { ...metadata, sheetId: sheet.id, region: regions[i]! } };
      });
      if (!screenshotImage) throw new Error("Preview browser returned no screenshot");
      return {
        ...report,
        screenshot: { ...screenshotImage, data: screenshotImage.data! },
        consoleMessages: [
          ...report.console.map(({ level, text }) => ({
            level: ["error", "assert"].includes(level) ? "error" : level,
            text,
          })),
          ...report.errors.map((e) => ({
            level: "uncaught",
            text: `${e.afterAction ? `${e.afterAction}: ` : ""}${e.message}`,
          })),
        ],
      };
    } catch (cause) {
      if (!pageStarted || !/timed out|timeout|Evaluation error/i.test(message(cause))) throw cause;
      recordError("freeze", message(cause), "load/settle");
      const first = report.screenshots[0];
      const image = first?.image;
      const { data: _data, ...metadata } = image ?? {};
      return {
        ...report,
        ok: false,
        screenshots:
          first && image
            ? [
                {
                  label: first.label,
                  image: {
                    ...metadata,
                    sheetId: image.id,
                    region: { x: 0, y: 0, width: image.width, height: image.height },
                  } as typeof first.image,
                },
              ]
            : [],
        ...(image?.data ? { screenshot: { ...image, data: image.data } } : {}),
        consoleMessages: report.errors.map((error) => ({ level: "uncaught", text: error.message })),
        summary: `Widget could not load or settle: ${message(cause)}. ${image ? "Initial screenshot retained." : "No screenshot could be captured."}`,
      };
    } finally {
      // Snapshot descendants before close, since Chrome children may be reparented.
      ownedPids = [...new Set([...ownedPids, ...(await processTree())])];
      try {
        if (ownedPids.length) await command(["close"], true);
      } catch {
        /* Kill fallback below owns only this preview's PIDs. */
      }
      await delay(100);
      for (const pid of ownedPids) {
        try {
          process.kill(pid, "SIGKILL");
        } catch (cause) {
          if (object(cause).code !== "ESRCH") {
            // eslint-disable-next-line no-unsafe-finally -- Failure to kill owned processes must fail the preview.
            throw cause;
          }
        }
      }
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      try {
        // Chrome/profile writers may still be exiting after SIGKILL.
        await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } finally {
        process.removeListener("exit", onExit);
      }
    }
  };
}
