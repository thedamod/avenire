import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { readableLocalPath, normalizeCapturePath } from "./local-file.ts";
import { isAbsolute, win32, join } from "node:path";
import { planReopen, positionUrl } from "@avenire/capture/reopen";
import { normalizeUrl } from "@avenire/capture/url";
import type { CapturePosition, LibraryFile, ReopenPlan } from "@avenire/contracts";
import type { ReopenResult } from "../bridge.ts";
import type { LocalOriginRegistry, LocalOrigin } from "./registry.ts";

const execute = promisify(execFile);
const executable =
  /\.(?:exe|dll|ocx|sys|so|dylib|app|lnk|pif|scf|sct|inf|ins|isp|job|appref-ms|application|msc|ps1xml|psc1|bat|cmd|com|ps1|psm1|psd1|sh|bash|zsh|fish|command|desktop|msi|msp|scr|jar|vbs|vbe|js|jse|wsf|wsh|hta|cpl|reg|url|webloc|scpt|applescript|workflow|service|py|pyw|rb|pl|php|gadget|dmg|iso|deb|rpm|apk)(?:[\\/]|$)/i;
export function validLocalPath(path: string): boolean {
  return (
    !!path &&
    (isAbsolute(path) || win32.isAbsolute(path)) &&
    !/^(?:\\\\|\/\/|\\\?\?|\\Device\\)/i.test(path) &&
    !/[\u0000-\u001f\u007f]/.test(path) &&
    !executable.test(path) &&
    !/(?:^|[\\/])[^\\/]*[. ](?:[\\/]|$)/.test(path) &&
    !path.replace(/^[a-z]:[\\/]/i, "").includes(":")
  );
}
export async function validateRegisteredFile(
  origin: LocalOrigin,
): Promise<{ path: string; changed: boolean } | undefined> {
  if (!validLocalPath(origin.path)) return undefined;
  try {
    const path = normalizeCapturePath(
      await realpath(readableLocalPath(origin.path) ?? origin.path),
    );
    if (!path) return undefined;
    if (!validLocalPath(path)) return undefined;
    const info = await stat(readableLocalPath(path) ?? path);
    if (!info.isFile()) return undefined;
    let changed = false;
    // A touched timestamp alone isn't a change: only different bytes are.
    if (info.size !== origin.sizeBytes || info.mtimeMs !== origin.mtimeMs) {
      const hash = createHash("sha256");
      for await (const bytes of createReadStream(readableLocalPath(path) ?? path))
        hash.update(bytes);
      changed = hash.digest("hex") !== origin.sha256;
    }
    return { path, changed };
  } catch {
    return undefined;
  }
}
const safeUrl = (value: string) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
};

/** App names/paths are native registry data. Every executable and argument is chosen here. */
export function positionCommand(
  platform: NodeJS.Platform,
  path: string,
  appName?: string,
  position?: CapturePosition,
): { file: string; args: string[] } | undefined {
  if (platform === "darwin" && /preview/i.test(appName ?? "") && position?.pdfPage)
    return { file: "/usr/bin/open", args: ["-a", "Preview", path] };
  const time = position?.mediaSec;
  if (time !== undefined && Number.isFinite(time) && time >= 0) {
    if (/^(?:vlc|vlc media player)$/i.test(appName ?? "")) {
      const file =
        platform === "darwin"
          ? "/Applications/VLC.app/Contents/MacOS/VLC"
          : platform === "win32"
            ? "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe"
            : "/usr/bin/vlc";
      if (existsSync(file)) return { file, args: [`--start-time=${time}`, "--", path] };
    }
    if (/^mpv$/i.test(appName ?? "")) {
      const file =
        platform === "darwin"
          ? "/opt/homebrew/bin/mpv"
          : platform === "win32"
            ? "C:\\Program Files\\mpv\\mpv.exe"
            : "/usr/bin/mpv";
      if (existsSync(file)) return { file, args: [`--start=${time}`, "--", path] };
    }
  }
  if (platform === "win32" && position?.pdfPage && /acrobat|acrord32/i.test(appName ?? "")) {
    const candidates = ["C:\\Program Files", "C:\\Program Files (x86)"].flatMap((root) => [
      join(root, "Adobe", "Acrobat DC", "Acrobat", "Acrobat.exe"),
      join(root, "Adobe", "Acrobat Reader DC", "Reader", "AcroRd32.exe"),
    ]);
    const file = candidates.find(existsSync);
    if (file) return { file, args: ["/A", `page=${position.pdfPage}`, path] };
  }
  return undefined;
}
export async function executeReopen(
  fileId: string,
  requested: ReopenPlan | undefined,
  options: {
    readonly owner: string;
    readonly deviceId: string;
    readonly registry: LocalOriginRegistry;
    readonly getFile: (id: string) => Promise<LibraryFile>;
    readonly opened?: (id: string) => Promise<unknown>;
    readonly openPath: (path: string) => Promise<string>;
    readonly openExternal: (url: string) => Promise<unknown>;
    readonly extension?: {
      connected(): boolean;
      reopen(url: string, position?: CapturePosition): Promise<boolean>;
    };
    readonly stillOwner?: () => boolean;
    readonly exec?: (file: string, args: string[]) => Promise<unknown>;
  },
): Promise<ReopenResult> {
  try {
    if (requested && "fileId" in requested && requested.fileId !== fileId)
      return { ok: false, note: "missing" };
    const local = options.registry.get(options.owner, fileId);
    let result: ReopenResult;
    if (local && (!requested || requested._tag === "OpenLocal")) {
      const pageUrl = local.originUrl && safeUrl(normalizeUrl(local.originUrl));
      if (!requested && pageUrl) {
        if (options.stillOwner?.() === false) return { ok: false, note: "missing" };
        const focused = await options.extension?.reopen(pageUrl);
        if (options.stillOwner?.() === false) return { ok: false, note: "missing" };
        if (!focused) await options.openExternal(pageUrl);
        if (options.opened) await options.opened(fileId).catch(() => {});
        return { ok: true };
      }
      const checked = await validateRegisteredFile(local);
      if (!checked || options.stillOwner?.() === false) return { ok: false, note: "missing" };
      const command = positionCommand(
        process.platform,
        checked.path,
        local.appName,
        requested?._tag === "OpenLocal" ? requested.position : undefined,
      );
      if (command)
        await (
          options.exec ??
          ((file, args) => execute(file, args, { timeout: 5000, windowsHide: true }))
        )(command.file, command.args);
      else if (await options.openPath(checked.path)) return { ok: false, note: "missing" };
      result = { ok: true, ...(checked.changed ? { note: "changed-since-capture" as const } : {}) };
    } else {
      const file = await options.getFile(fileId);
      if (file.id !== fileId || options.stillOwner?.() === false)
        return { ok: false, note: "missing" };
      if (
        file.origin?._tag === "LocalFile" &&
        file.origin.deviceId !== options.deviceId &&
        !file.origin.originUrl
      )
        return { ok: false, note: "other-device" };
      const plans = planReopen(file.origin ?? null, {
        fileId: file.id,
        desktop: true,
        deviceId: options.deviceId,
        extension: options.extension?.connected() ?? false,
      });
      const plan = requested ? plans.find((plan) => plan._tag === requested._tag) : plans[0];
      if (!plan || plan._tag === "OpenLocal" || plan._tag === "OpenInLibrary")
        return { ok: false, note: "missing" };
      const url = safeUrl(
        plan._tag === "FocusTab" ? positionUrl(normalizeUrl(plan.url), plan.position) : plan.url,
      );
      if (!url) return { ok: false };
      if (plan._tag !== "FocusTab" || !(await options.extension?.reopen(plan.url, plan.position))) {
        if (options.stillOwner?.() === false) return { ok: false };
        await options.openExternal(url);
      }
      result = { ok: true };
    }
    if (result.ok && options.opened) await options.opened(fileId).catch(() => {});
    return result;
  } catch {
    return { ok: false, note: "missing" };
  }
}
