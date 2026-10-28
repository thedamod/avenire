import * as Crypto from "node:crypto";
import { localFilePath } from "./local-file.ts";
import {
  cachedNative,
  collectNative,
  correlateBrowserMedia,
  mergeNativeWindows,
  retainNative,
} from "./native.ts";
import { createCaptureContext } from "./research/electron/collectors/capture-context.ts";
import { CaptureId } from "@avenire/contracts";
import type {
  CaptureSnapshot,
  CapturedMedia,
  CapturedTab,
  CapturedWindow,
} from "@avenire/contracts";
import { cachedForeground, resolveForeground, collectForeground } from "./foreground.ts";
import { collectSelection } from "./selection.ts";
import { latestTabs } from "./tabs.ts";

let installId = Crypto.randomBytes(16).toString("hex");
export function setCaptureDeviceId(id: string) {
  installId = id;
}

type Collected = {
  readonly windows?: readonly CapturedWindow[];
  readonly tabs?: readonly CapturedTab[];
  readonly media?: readonly CapturedMedia[];
  readonly selectionText?: string;
  readonly notes?: readonly string[];
};
type Collector = () => Promise<Collected>;

async function withTimeout(collector: Collector, timeoutMs = 1500): Promise<Collected> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      collector(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function collectSnapshot(
  capturedAt = new Date().toISOString(),
  options: { readonly foreground: boolean } = { foreground: false },
): Promise<CaptureSnapshot> {
  const collectors: readonly [string, Collector][] = [
    [
      "foreground",
      options.foreground
        ? collectForeground
        : async () => ({ notes: ["Foreground capture disabled in desktop setup."] }),
    ],
    ["tabs", async () => ({ tabs: latestTabs() })],
    ["selection", collectSelection],
  ];
  const results = await Promise.allSettled(
    // The research path collectors include a bounded Windows handle scan.
    collectors.map(([name, collector]) =>
      withTimeout(collector, name === "foreground" ? 4000 : 1500),
    ),
  );
  const values: Collected[] = [];
  const notes: string[] = [];
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    if (result?.status === "fulfilled") {
      values.push(result.value);
      notes.push(...(result.value.notes ?? []));
    } else {
      const reason = result?.status === "rejected" ? result.reason : "unknown error";
      notes.push(
        `${collectors[index]?.[0] ?? "collector"} collector failed: ${reason instanceof Error ? reason.message : String(reason)}`,
      );
      values.push({});
    }
  }
  const selectionText = values.find((value) => value.selectionText !== undefined)?.selectionText;
  const tabs = values.flatMap((value) => value.tabs ?? []);
  const browserFiles: CapturedWindow[] = [];
  // Browser file URLs are device paths, not URLs the server can fetch.
  // Preserve them as native upload candidates; private tabs never become candidates.
  for (const tab of tabs) {
    if (tab.incognito || !(tab.finalUrl ?? tab.url).startsWith("file:")) continue;
    try {
      browserFiles.push({
        appName: "Browser",
        title: tab.title,
        filePath: localFilePath(tab.finalUrl ?? tab.url),
        foreground: tab.activeInWindow,
      });
    } catch {
      notes.push("A browser file URL could not be resolved on this device.");
    }
  }
  const native = options.foreground ? await collectNative() : { windows: [], media: [], notes: [] };
  const correlated = correlateBrowserMedia(native, tabs);
  const platform =
    process.platform === "darwin" || process.platform === "win32" || process.platform === "linux"
      ? process.platform
      : "linux";
  return {
    id: CaptureId.make(Crypto.randomUUID()),
    capturedAt,
    deviceId: installId,
    platform,
    windows: mergeNativeWindows(
      values.flatMap((value) => value.windows ?? []),
      correlated.windows,
      browserFiles,
    ),
    tabs: correlated.tabs,
    media: correlated.media,
    ...(selectionText === undefined ? {} : { selectionText }),
    collectorNotes: [...notes, ...correlated.notes],
  };
}

/** The hotkey never waits on an OS call, session lookup, disk read, or extraction. */
export function instantCapture(capturedAt: string, foreground: boolean) {
  const observation = foreground ? cachedForeground() : { windows: [], notes: [] };
  const cached = foreground ? cachedNative() : { windows: [], media: [], notes: [] };
  const native = correlateBrowserMedia(cached, latestTabs());
  const tabs = native.tabs;
  const browserFiles: CapturedWindow[] = [];
  for (const tab of tabs) {
    if (tab.incognito || !(tab.finalUrl ?? tab.url).startsWith("file:")) continue;
    try {
      browserFiles.push({
        appName: "Browser",
        title: tab.title,
        filePath: localFilePath(tab.finalUrl ?? tab.url),
        foreground: tab.activeInWindow,
      });
    } catch {
      /* Unsupported file URL: never a server URL. */
    }
  }
  const snapshot: CaptureSnapshot = {
    id: CaptureId.make(Crypto.randomUUID()),
    capturedAt,
    deviceId: installId,
    platform:
      process.platform === "darwin" || process.platform === "win32" ? process.platform : "linux",
    windows: mergeNativeWindows(native.windows, browserFiles),
    tabs,
    media: native.media,
    collectorNotes: [...observation.notes, ...native.notes],
  };
  return {
    snapshot,
    resolve: async () => {
      const notes: string[] = [];
      const ctx = createCaptureContext(notes, 9000);
      const [resolved, filled] = await Promise.all([
        resolveForeground(observation, ctx),
        foreground
          ? collectNative(observation.app, ctx)
          : Promise.resolve({ windows: [], media: [], notes: [] }),
      ]);
      const correlated = correlateBrowserMedia(retainNative(filled, cached), tabs);
      return {
        ...snapshot,
        tabs: correlated.tabs,
        windows: mergeNativeWindows(resolved.windows, correlated.windows, browserFiles),
        media: correlated.media,
        collectorNotes: [...resolved.notes, ...notes],
      };
    },
  };
}
