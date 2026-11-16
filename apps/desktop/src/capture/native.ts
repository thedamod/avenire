import { nativeFile } from "./native-file.ts";
import type { CapturedMedia, CapturedTab, CapturedWindow } from "@avenire/contracts";
import type { ForegroundApp } from "./support/types.ts";
import { isBrowserApp, BROWSER_HINT } from "./support/app-catalog.ts";
import {
  createCaptureContext,
  type CaptureContext,
} from "./collectors/capture-context.ts";
import { getBackgroundWindows } from "./collectors/background-windows.ts";
import { getBackgroundMedia } from "./collectors/background-media.ts";
import { resolveObsidianOpenNotes } from "./collectors/obsidian-note.ts";
import { bounded } from "./timing.ts";
import { localBasename } from "./local-file.ts";

export type NativeObservation = {
  readonly windows: readonly CapturedWindow[];
  readonly media: readonly CapturedMedia[];
  readonly notes: readonly string[];
  readonly observedAt?: number;
  readonly failed?: readonly string[];
};
const empty = (): NativeObservation => ({ windows: [], media: [], notes: [] });
let cached = empty();
let flight: Promise<NativeObservation> | undefined;
let generation = 0;
export const cachedNative = () =>
  Date.now() - (cached.observedAt ?? 0) <= 30_000 ? cached : empty();
export function clearNativeCache() {
  generation++;
  cached = empty();
}

/** Fixed wall-clock budgets; the instant path never awaits these collectors. */
export async function collectNative(
  foreground?: ForegroundApp,
  ctx: CaptureContext = createCaptureContext([], 9000),
): Promise<NativeObservation> {
  const notes = ctx.notes;
  const failed: string[] = [];
  const run = async <A>(name: string, work: Promise<A>, ms: number, fallback: A): Promise<A> => {
    try {
      return await bounded(work, ms);
    } catch {
      notes.push(`${name}:budget-exhausted`);
      failed.push(name);
      return name === "background-windows" ? ((ctx.partialWindows ?? fallback) as A) : fallback;
    }
  };
  const [background, sessions, obsidian] = await Promise.all([
    run("background-windows", getBackgroundWindows(foreground?.processId, notes, ctx), 9000, []),
    run("background-media", getBackgroundMedia(notes, ctx), 9000, []),
    run("obsidian", resolveObsidianOpenNotes(notes), 3500, []),
  ]);
  const windows: CapturedWindow[] = background.flatMap((entry) => {
    const path = nativeFile(entry.appName, entry.filePath);
    return path
      ? [
          {
            appName: entry.appName,
            title: entry.windowTitle.slice(0, 2000),
            foreground: false,
            filePath: path,
          },
        ]
      : [];
  });
  for (const candidate of obsidian) {
    const path = nativeFile("Obsidian", candidate);
    if (!path) continue;
    windows.push({
      appName: "Obsidian",
      title: localBasename(path),
      filePath: path,
      foreground: false,
    });
  }
  const media: CapturedMedia[] = sessions.flatMap((entry) => {
    const path = nativeFile(entry.appName, entry.filePath);
    if (!path && !isBrowserApp(entry.appName) && !BROWSER_HINT.test(entry.appName)) return [];
    return [
      {
        appName: entry.appName,
        title: entry.title.slice(0, 2000),
        ...(path ? { filePath: path } : {}),
        ...(entry.positionSec !== undefined &&
        Number.isFinite(entry.positionSec) &&
        entry.positionSec >= 0
          ? { positionSec: entry.positionSec }
          : {}),
        ...(entry.durationSec !== undefined &&
        Number.isFinite(entry.durationSec) &&
        entry.durationSec > 0
          ? { durationSec: entry.durationSec }
          : {}),
      },
    ];
  });
  // Policy requires an independently attributed native path. Keep it in the device snapshot.
  for (const entry of media)
    if (entry.filePath)
      windows.push({
        appName: entry.appName,
        title: entry.title,
        filePath: entry.filePath,
        foreground: false,
      });
  for (const [name, pattern] of [
    ["background-windows", /bgwin:.*(?:fail|unavailable)/],
    ["background-media", /(?:bgmedia|mpris|smtc):.*(?:fail|unavailable|no-playerctl|err:)/],
    ["obsidian", /obsidian:.*(?:fail|unavailable)/],
  ] as const)
    if (notes.some((note) => pattern.test(note))) failed.push(name);
  return { windows, media, notes: [...notes], failed, observedAt: Date.now() };
}

/** Correlate only one unambiguous permitted browser tab; never invent a media URL. */
export function correlateBrowserMedia(
  native: NativeObservation,
  tabs: readonly CapturedTab[],
): NativeObservation & { tabs: readonly CapturedTab[] } {
  const updated = [...tabs];
  const media: CapturedMedia[] = [];
  const windows = [...native.windows];
  for (const entry of native.media) {
    if (!isBrowserApp(entry.appName) && !BROWSER_HINT.test(entry.appName)) {
      media.push(entry);
      continue;
    }
    const matches = updated
      .map((tab, index) => ({ tab, index }))
      .filter(
        ({ tab }) =>
          !tab.incognito &&
          /^https?:/i.test(tab.url) &&
          browserMatches(entry.appName, tab) &&
          tab.title.trim().toLowerCase() === entry.title.trim().toLowerCase(),
      );
    if (matches.length !== 1) continue;
    const { tab, index } = matches[0]!;
    updated[index] = {
      ...tab,
      ...(entry.positionSec === undefined
        ? {}
        : { position: { ...tab.position, mediaSec: entry.positionSec } }),
    };
    media.push({ ...entry, title: tab.title, url: tab.finalUrl ?? tab.url });
    windows.push({ appName: entry.appName, title: tab.title, foreground: false });
  }
  return { ...native, windows, media, tabs: updated };
}

export function refreshNative(foreground?: ForegroundApp): Promise<NativeObservation> {
  if (flight) return flight;
  const epoch = generation;
  flight = collectNative(foreground)
    .then((value) => {
      if (generation === epoch) cached = retainNative(value, cachedNative());
      return value;
    })
    .finally(() => {
      flight = undefined;
    });
  return flight;
}
export function startNativePoll(enabled: () => boolean): () => void {
  const poll = () => {
    if (enabled()) void refreshNative();
    else clearNativeCache();
  };
  const timer = setInterval(poll, 2000);
  timer.unref();
  poll();
  return () => {
    clearInterval(timer);
    clearNativeCache();
  };
}

function browserMatches(appName: string, tab: CapturedTab): boolean {
  const names = {
    chrome: /chrome|chromium/i,
    edge: /msedge|microsoft edge/i,
    brave: /brave/i,
    firefox: /firefox/i,
    opera: /opera/i,
    vivaldi: /vivaldi/i,
    arc: /^arc$/i,
    other: /^other$/i,
  };
  return names[tab.browser].test(appName);
}
export function mergeNativeWindows(
  ...groups: ReadonlyArray<readonly CapturedWindow[]>
): CapturedWindow[] {
  const result: CapturedWindow[] = [];
  for (const entry of groups.flat()) {
    const index = result.findIndex(
      (other) =>
        other.appName === entry.appName &&
        other.title === entry.title &&
        (!other.filePath || !entry.filePath || other.filePath === entry.filePath),
    );
    if (index < 0) result.push(entry);
    else
      result[index] = {
        ...result[index]!,
        ...entry,
        foreground: result[index]!.foreground || entry.foreground,
      };
  }
  return result;
}

/** A successful empty enumeration closes sources; a failed one retains fresh owner-bound facts. */
export function retainNative(
  value: NativeObservation,
  previous: NativeObservation,
): NativeObservation {
  if (!value.failed?.length || Date.now() - (previous.observedAt ?? 0) > 30_000) return value;
  const windows = previous.windows.filter(
    (entry) =>
      value.failed!.includes(entry.appName === "Obsidian" ? "obsidian" : "background-windows") ||
      (value.failed!.includes("background-media") &&
        previous.media.some((media) => media.filePath === entry.filePath)),
  );
  return {
    ...value,
    windows: mergeNativeWindows(windows, value.windows),
    media: value.failed.includes("background-media")
      ? [...previous.media, ...value.media]
      : value.media,
    observedAt: previous.observedAt!,
  };
}
