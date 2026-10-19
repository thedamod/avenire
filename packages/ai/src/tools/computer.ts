import { ChatSandboxes } from "@avenire/cloud/chat-sandbox";
import { CloudBoxes, CLOUD_WORKSPACE } from "@avenire/cloud/cloud-box";
import { attempt, decodeBase64, isDaytonaNotFound } from "@avenire/cloud/daytona";
import {
  SCREEN,
  SCREEN_PROFILES,
  toScreen,
  toModel,
  screenshotScale,
  type ScreenProfile,
} from "@avenire/cloud/screen";
import { Database } from "@avenire/database/client";
import { cloudRun, cloudToolCall } from "@avenire/database/schema";
import { and, eq, sql } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { posix } from "node:path";
import { randomUUID } from "node:crypto";
import { COMPUTER_TOOL_SPECS, type ComputerInput } from "./computer-specs.ts";
import { registerTool, type ToolRegistration } from "./registration.ts";
import { type AgentContext, RuthToolError } from "./core.ts";
import { pngImage } from "./images.ts";
import { inputsRootFor } from "../cloud/paths.ts";

export type ComputerServices = ChatSandboxes | CloudBoxes | Database;
const fail = (tool: string, message: string, code: RuthToolError["code"] = "invalid_input") =>
  new RuthToolError({ tool, message, code, recoverable: true });
export const coordinateContract = (profile: ScreenProfile) => {
  const c = profile.coordinates;
  return `Screen profile ${profile.id}: full screenshot ${profile.image.width}×${profile.image.height}; desktop ${SCREEN.width}×${SCREEN.height}; x/y ${c.kind === "normalized" ? `normalized integers, inclusive 0..${c.max} on both axes` : `image pixels, integers x=0..${profile.image.width - 1}, y=0..${profile.image.height - 1}`}. Coordinates always refer to the full screen. For a cropped bitmap, add its native desktop crop.x/y to local image pixels, then map desktop pixels into the active profile before acting.`;
};
const pointValid = (x: number | undefined, y: number | undefined, p: ScreenProfile) =>
  Number.isInteger(x) &&
  Number.isInteger(y) &&
  x! >= 0 &&
  y! >= 0 &&
  (p.coordinates.kind === "normalized"
    ? x! <= p.coordinates.max && y! <= p.coordinates.max
    : x! < p.image.width && y! < p.image.height);
const validKey = (key: string) =>
  /^[a-z0-9]$/i.test(key) ||
  /^(enter|return|escape|esc|tab|space|backspace|delete|insert|home|end|pageup|pagedown|up|down|left|right|f(?:[1-9]|1[0-2]))$/i.test(
    key,
  );
export const validateComputerAction = (i: ComputerInput, p: ScreenProfile): string | null => {
  if (
    ["click", "double_click", "right_click", "move", "drag", "scroll"].includes(i.action) &&
    !pointValid(i.x, i.y, p)
  )
    return "Supply integer x/y within the active profile range.";
  if (i.action === "drag" && !pointValid(i.toX, i.toY, p))
    return "Supply valid drag destination toX/toY.";
  if (
    i.action === "scroll" &&
    (!i.direction ||
      !["up", "down", "left", "right"].includes(i.direction) ||
      (i.amount !== undefined && (!Number.isInteger(i.amount) || i.amount < 1 || i.amount > 100)))
  )
    return "Supply a scroll direction and amount from 1 to 100.";
  if (
    i.action === "type" &&
    (i.text === undefined || i.text.length > 10000 || i.text.includes("\0"))
  )
    return "Supply text of at most 10000 characters without NUL.";
  if (i.action === "key" && (i.keys?.length !== 1 || !validKey(i.keys[0]!)))
    return "Supply exactly one allowed key.";
  if (
    i.action === "hotkey" &&
    (!i.keys?.length ||
      i.keys.length > 5 ||
      !validKey(i.keys.at(-1)!) ||
      i.keys.slice(0, -1).some((k) => !["ctrl", "alt", "shift", "super", "cmd"].includes(k)))
  )
    return "Supply an atomic modifier chord ending in an allowed key.";
  if (
    i.action === "wait" &&
    i.amount !== undefined &&
    (!Number.isInteger(i.amount) || i.amount < 1 || i.amount > 10)
  )
    return "Wait amount is seconds, from 1 to 10.";
  if (i.region) {
    const r = i.region;
    const maxX = p.coordinates.kind === "normalized" ? p.coordinates.max : p.image.width;
    const maxY = p.coordinates.kind === "normalized" ? p.coordinates.max : p.image.height;
    if (
      !pointValid(r.x, r.y, p) ||
      !Number.isInteger(r.width) ||
      !Number.isInteger(r.height) ||
      r.width <= 0 ||
      r.height <= 0 ||
      r.x + r.width > maxX ||
      r.y + r.height > maxY
    )
      return "Crop must fit the full screen in the active coordinate space.";
  }
  return null;
};
export const targetFor = Effect.fn("Computer.target")(function* (ctx: AgentContext) {
  if (ctx.agent === "ruth-cloud") {
    const box = yield* (yield* CloudBoxes).running(ctx.userId);
    if (Option.isNone(box))
      return yield* fail("computer", "The Cloud box is unavailable.", "sandbox_unavailable");
    return box.value.sandbox;
  }
  if (!ctx.threadId) return yield* fail("computer", "A chat thread is required.");
  return yield* (yield* ChatSandboxes).target({ userId: ctx.userId, threadId: ctx.threadId });
});

export const makeComputerRegistry = (
  profile: ScreenProfile = SCREEN_PROFILES[0],
  maxActions = 500,
  initialActions = 0,
) => {
  let actions = initialActions;
  const desktopStarted = new Set<string>();
  const ensureDesktop = (sandbox: import("@avenire/cloud/cloud-box").CloudBox["sandbox"]) =>
    desktopStarted.has(sandbox.id)
      ? Effect.void
      : attempt("computerStart", () => sandbox.computerUse.start()).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              desktopStarted.add(sandbox.id);
            }),
          ),
          Effect.asVoid,
        );
  const jobs = new Map<string, { commandId: string }>();
  const policy = { agents: ["ruth", "ruth-cloud"], approval: "never" } as const;
  const computer = registerTool({
    spec: {
      ...COMPUTER_TOOL_SPECS.computer,
      description: `${COMPUTER_TOOL_SPECS.computer.description}\n${coordinateContract(profile)}`,
    },
    policy,
    execute: Effect.fn("Computer.action")(function* (input, ctx) {
      const invalid = validateComputerAction(input, profile);
      if (invalid) return yield* fail("computer", invalid);
      if (actions >= maxActions)
        return yield* fail("computer", "The desktop action budget is exhausted.", "quota_exceeded");
      actions++;
      if (ctx.runId)
        yield* (yield* Database).use((db) =>
          db
            .update(cloudRun)
            .set({
              usage: sql`jsonb_set(${cloudRun.usage}, '{actions}', to_jsonb(coalesce((${cloudRun.usage}->>'actions')::int, 0) + 1))`,
            })
            .where(and(eq(cloudRun.id, ctx.runId!), eq(cloudRun.userId, ctx.userId))),
        );
      const sandbox = yield* targetFor(ctx);
      yield* ensureDesktop(sandbox);
      const c = sandbox.computerUse;
      const p = toScreen({ x: input.x ?? 0, y: input.y ?? 0 }, profile);
      if (
        input.action === "click" ||
        input.action === "double_click" ||
        input.action === "right_click"
      )
        yield* attempt("computerClick", () =>
          c.mouse.click(
            p.x,
            p.y,
            input.action === "right_click" ? "right" : "left",
            input.action === "double_click",
          ),
        );
      if (input.action === "move") yield* attempt("computerMove", () => c.mouse.move(p.x, p.y));
      if (input.action === "drag") {
        const q = toScreen({ x: input.toX!, y: input.toY! }, profile);
        yield* attempt("computerDrag", () => c.mouse.drag(p.x, p.y, q.x, q.y));
      }
      if (input.action === "scroll") {
        if (input.direction === "left" || input.direction === "right") {
          // SDK scroll only exposes vertical directions; use the desktop's horizontal wheel buttons.
          yield* attempt("computerHorizontalScroll", () =>
            sandbox.process.executeCommand(
              `DISPLAY=:0 xdotool mousemove ${p.x} ${p.y} click --repeat ${input.amount ?? 3} ${input.direction === "left" ? 6 : 7}`,
              CLOUD_WORKSPACE,
              undefined,
              10,
            ),
          );
        } else
          yield* attempt("computerScroll", () =>
            c.mouse.scroll(p.x, p.y, input.direction as "up" | "down", input.amount ?? 3),
          );
      }
      if (input.action === "type")
        yield* attempt("computerType", () => c.keyboard.type(input.text!));
      if (input.action === "key")
        yield* attempt("computerKey", () => c.keyboard.press(input.keys![0]!));
      if (input.action === "hotkey")
        yield* attempt("computerHotkey", () => c.keyboard.hotkey(input.keys!.join("+")));
      yield* Effect.sleep(input.action === "wait" ? `${input.amount ?? 1} seconds` : "200 millis");
      let crop: { x: number; y: number; width: number; height: number } | null = null;
      if (input.region) {
        const r = input.region;
        const origin = toScreen({ x: r.x, y: r.y }, profile);
        const end = toScreen({ x: r.x + r.width, y: r.y + r.height }, profile);
        crop = {
          ...origin,
          width: Math.max(
            1,
            (r.x + r.width ===
            (profile.coordinates.kind === "normalized"
              ? profile.coordinates.max
              : profile.image.width)
              ? SCREEN.width
              : end.x) - origin.x,
          ),
          height: Math.max(
            1,
            (r.y + r.height ===
            (profile.coordinates.kind === "normalized"
              ? profile.coordinates.max
              : profile.image.height)
              ? SCREEN.height
              : end.y) - origin.y,
          ),
        };
      }
      const frame = yield* attempt("computerScreenshot", () =>
        crop
          ? c.screenshot.takeCompressedRegion(crop, { scale: 1, format: "png" })
          : c.screenshot.takeCompressed({ scale: screenshotScale(profile), format: "png" }),
      );
      if (!frame.screenshot)
        return yield* fail("computer", "Daytona returned no screenshot.", "failed");
      return {
        action: input.action,
        profile: profile.id,
        coordinateContract: coordinateContract(profile),
        crop,
        screenshot: pngImage(decodeBase64(frame.screenshot), {
          id: randomUUID(),
          width: crop?.width ?? profile.image.width,
          height: crop?.height ?? profile.image.height,
        }),
      };
    }),
  });
  const screen_read = registerTool({
    spec: {
      ...COMPUTER_TOOL_SPECS.screen_read,
      description: `${COMPUTER_TOOL_SPECS.screen_read.description}\n${coordinateContract(profile)}`,
    },
    policy,
    execute: Effect.fn("Computer.screenRead")(
      function* (input, ctx) {
        const s = yield* targetFor(ctx);
        yield* ensureDesktop(s);
        const limit = input.limit ?? 100;
        type Node = NonNullable<
          Awaited<ReturnType<typeof s.computerUse.accessibility.getTree>>["root"]
        >;
        const nodes: Node[] = [];
        let truncated = false;
        if (input.mode === "find") {
          const r = yield* attempt("accessibilityFind", () =>
            s.computerUse.accessibility.findNodes({
              scope: "all",
              ...(input.role ? { role: input.role } : {}),
              ...(input.name ? { name: input.name, nameMatch: "substring" } : {}),
              limit,
            }),
          );
          nodes.push(...(r.matches ?? []));
          truncated = r.truncated ?? false;
        } else {
          const r = yield* attempt("accessibilityTree", () =>
            s.computerUse.accessibility.getTree({ scope: "all", maxDepth: 12 }),
          );
          const walk = (n: Node) => {
            if (nodes.length >= limit) {
              truncated = true;
              return;
            }
            nodes.push(n);
            for (const child of n.children ?? []) walk(child);
          };
          if (r.root) walk(r.root);
          truncated ||= r.truncated ?? false;
        }
        const compact = nodes.slice(0, limit).map((n) => {
          const b = n.bounds;
          const origin = b ? toModel({ x: b.x ?? 0, y: b.y ?? 0 }, profile) : null;
          const end = b
            ? toModel({ x: (b.x ?? 0) + (b.width ?? 0), y: (b.y ?? 0) + (b.height ?? 0) }, profile)
            : null;
          return {
            id: n.id ?? "",
            role: n.role ?? "",
            name: (n.name ?? "").slice(0, 500),
            actions: n.actions ?? [],
            bounds:
              origin && end
                ? { ...origin, width: end.x - origin.x, height: end.y - origin.y }
                : null,
          };
        });
        return {
          profile: profile.id,
          nodes: compact,
          truncated,
          note: compact.length
            ? "Only applications exposing AT-SPI appear; use screenshots for missing Chromium content."
            : "No accessibility nodes exposed. Chromium may expose an empty tree; fall back to computer screenshot.",
        };
      },
      (effect) =>
        effect.pipe(
          Effect.catchTag("CloudError", (error) =>
            Effect.succeed({
              profile: profile.id,
              nodes: [],
              truncated: false,
              note: `Daytona accessibility is unavailable (${error.operation}${typeof error.cause === "object" && error.cause !== null && "response" in error.cause ? `, HTTP ${(error.cause as { response?: { status?: number } }).response?.status ?? "unknown"}` : ""}). Chromium may expose no tree; use computer screenshots or local browser DOM instead.`,
            }),
          ),
        ),
    ),
  });
  const safePath = Effect.fn("Box.safePath")(function* (
    input: string,
    ctx: AgentContext,
    write = false,
  ) {
    const path = posix.resolve(CLOUD_WORKSPACE, input);
    const roots =
      write || path === CLOUD_WORKSPACE || path.startsWith(`${CLOUD_WORKSPACE}/`)
        ? [CLOUD_WORKSPACE]
        : [CLOUD_WORKSPACE, yield* inputsRootFor(ctx)];
    const bounded = (p: string) => roots.some((r) => p === r || p.startsWith(`${r}/`));
    if (input.includes("\0") || !bounded(path))
      return yield* fail(
        "box_write",
        "Path escapes the allowed workspace/input roots.",
        "forbidden",
      );
    const s = yield* targetFor(ctx);
    // realpath -m resolves existing symlinks even for a not-yet-created leaf.
    const resolved = yield* attempt("boxRealpath", () =>
      s.process.executeCommand(
        `realpath -m -- ${shellQuote(path)}`,
        CLOUD_WORKSPACE,
        undefined,
        10,
      ),
    );
    if (resolved.exitCode !== 0 || !bounded(resolved.result.trim()))
      return yield* fail("box_write", "Symlink escapes an allowed path root.", "forbidden");
    return { path: resolved.result.trim(), sandbox: s };
  });
  const box_exec = registerTool({
    spec: COMPUTER_TOOL_SPECS.box_exec,
    policy,
    execute: Effect.fn("Box.exec")(function* (i, ctx) {
      const s = yield* targetFor(ctx);
      const r = yield* attempt("boxExec", () =>
        s.process.executeCommand(i.command, CLOUD_WORKSPACE, undefined, i.timeoutSec ?? 120),
      );
      return {
        exitCode: r.exitCode,
        output: capOutput(r.result),
        truncated: Buffer.byteLength(r.result) > 65536,
      };
    }),
  });
  const box_write = registerTool({
    spec: COMPUTER_TOOL_SPECS.box_write,
    policy,
    execute: Effect.fn("Box.write")(function* (i, ctx) {
      const { path, sandbox: s } = yield* safePath(i.path, ctx, true);
      const bytes = Buffer.from(i.content);
      if (bytes.length > 10 * 1024 * 1024)
        return yield* fail("box_write", "Content exceeds 10 MiB.");
      yield* attempt("boxWriteParent", () => s.fs.createFolder(posix.dirname(path), "755"));
      yield* attempt("boxWrite", () => s.fs.uploadFile(bytes, path));
      return { path, sizeBytes: bytes.length };
    }),
  });
  const box_read = registerTool({
    spec: COMPUTER_TOOL_SPECS.box_read,
    policy,
    execute: Effect.fn("Box.read")(function* (i, ctx) {
      const { path, sandbox: s } = yield* safePath(i.path, ctx);
      const stat = yield* attempt("boxStat", () => s.fs.getFileDetails(path));
      if (stat.isDir || stat.size > 1024 * 1024)
        return yield* fail("box_read", "Read a regular file up to 1 MiB.");
      const bytes = yield* attempt("boxRead", () => s.fs.downloadFile(path));
      if (bytes.length > 1024 * 1024) return yield* fail("box_read", "File grew beyond 1 MiB.");
      return { path, content: bytes.toString("utf8") };
    }),
  });
  const box_list = registerTool({
    spec: COMPUTER_TOOL_SPECS.box_list,
    policy,
    execute: Effect.fn("Box.list")(function* (i, ctx) {
      const { path, sandbox: s } = yield* safePath(i.path ?? CLOUD_WORKSPACE, ctx);
      const rows = yield* attempt("boxList", () => s.fs.listFiles(path));
      return {
        entries: rows.slice(0, 200).map((r) => ({ name: r.name, isDir: r.isDir, size: r.size })),
        truncated: rows.length > 200,
      };
    }),
  });
  const jobFor = Effect.fn("Box.jobFor")(function* (jobId: string, ctx: AgentContext) {
    const cached = jobs.get(jobId);
    if (cached) return cached;
    if (ctx.runId) {
      const row = yield* (yield* Database).use((db) =>
        db.query.cloudToolCall.findFirst({
          where: and(eq(cloudToolCall.runId, ctx.runId!), eq(cloudToolCall.sessionId, jobId)),
        }),
      );
      if (row?.commandId) return { commandId: row.commandId };
    }
    if (!ctx.runId && ctx.threadId && jobId.startsWith(`avenire-${ctx.threadId}-`)) {
      const s = yield* targetFor(ctx);
      const session = yield* attempt("boxReattachChatJob", () => s.process.getSession(jobId));
      const commandId = session.commands?.[0]?.id;
      if (commandId) {
        jobs.set(jobId, { commandId });
        return { commandId };
      }
    }
    return yield* fail("box_command_status", "Unknown job id for this run/thread.", "not_found");
  });
  const box_command_start = registerTool({
    spec: COMPUTER_TOOL_SPECS.box_command_start,
    policy,
    execute: Effect.fn("Box.commandStart")(function* (i, ctx) {
      const s = yield* targetFor(ctx);
      const jobId = `avenire-${ctx.runId ?? ctx.threadId}-${ctx.toolCallId ?? randomUUID()}`;
      // A crash after remote launch but before DB completion is reconciled from the deterministic session.
      const existing = yield* attempt("boxFindSession", () => s.process.getSession(jobId)).pipe(
        Effect.catchTag("CloudError", (error) =>
          isDaytonaNotFound(error.cause) ? Effect.succeed(undefined) : Effect.fail(error),
        ),
      );
      let commandId = existing?.commands?.[0]?.id;
      if (!commandId) {
        if (!existing) yield* attempt("boxCreateSession", () => s.process.createSession(jobId));
        const r = yield* attempt("boxStartCommand", () =>
          s.process.executeSessionCommand(jobId, {
            command: `cd ${shellQuote(CLOUD_WORKSPACE)} && ${i.command}`,
            runAsync: true,
          }),
        );
        commandId = r.cmdId;
      }
      if (!commandId) return yield* fail("box_command_start", "No command id returned.", "failed");
      jobs.set(jobId, { commandId });
      if (ctx.runId && ctx.toolCallId)
        yield* (yield* Database).use((db) =>
          db
            .update(cloudToolCall)
            .set({ sessionId: jobId, commandId })
            .where(
              and(
                eq(cloudToolCall.runId, ctx.runId!),
                eq(cloudToolCall.toolCallId, ctx.toolCallId!),
              ),
            ),
        );
      return { jobId, commandId };
    }),
  });
  const box_command_status = registerTool({
    spec: COMPUTER_TOOL_SPECS.box_command_status,
    policy,
    execute: Effect.fn("Box.commandStatus")(function* (i, ctx) {
      const j = yield* jobFor(i.jobId, ctx);
      const s = yield* targetFor(ctx);
      const r = yield* attempt("boxCommandStatus", () =>
        s.process.getSessionCommand(i.jobId, j.commandId),
      );
      return { jobId: i.jobId, exitCode: r.exitCode ?? null };
    }),
  });
  const box_command_logs = registerTool({
    spec: COMPUTER_TOOL_SPECS.box_command_logs,
    policy,
    execute: Effect.fn("Box.commandLogs")(function* (i, ctx) {
      const j = yield* jobFor(i.jobId, ctx);
      const s = yield* targetFor(ctx);
      const r = yield* attempt("boxCommandLogs", () =>
        s.process.getSessionCommandLogs(i.jobId, j.commandId),
      );
      return {
        jobId: i.jobId,
        output: capOutput(r.output ?? `${r.stdout ?? ""}${r.stderr ?? ""}`),
      };
    }),
  });
  const box_command_cancel = registerTool({
    spec: COMPUTER_TOOL_SPECS.box_command_cancel,
    policy,
    execute: Effect.fn("Box.commandCancel")(function* (i, ctx) {
      yield* jobFor(i.jobId, ctx);
      const s = yield* targetFor(ctx);
      yield* attempt("boxCommandCancel", () => s.process.deleteSession(i.jobId)).pipe(
        Effect.catchTag("CloudError", (error) =>
          isDaytonaNotFound(error.cause) ? Effect.void : Effect.fail(error),
        ),
      );
      return { jobId: i.jobId, cancelled: true };
    }),
  });
  return {
    registry: {
      computer,
      screen_read,
      box_exec,
      box_write,
      box_read,
      box_list,
      box_command_start,
      box_command_status,
      box_command_logs,
      box_command_cancel,
    } satisfies Record<string, ToolRegistration<ComputerServices>>,
    actions: () => actions,
  };
};
export const shellQuote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;
export const capOutput = (text: string) => {
  const bytes = Buffer.from(text);
  let offset = Math.max(0, bytes.length - 65536);
  while (offset < bytes.length && (bytes[offset]! & 0xc0) === 0x80) offset++;
  return bytes.subarray(offset).toString();
};
