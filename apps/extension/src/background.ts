import type { CapturedTab, ExtensionMessage } from "@avenire/contracts";
import { captureResult, captureTabs } from "./capture.ts";
import { DesktopChannel } from "./channel.ts";
import { uploadCapture } from "./direct.ts";
import { fileFrames } from "./files.ts";
import { fetchPairing, pairingToken, type PairingState } from "./pairing.ts";
import { reopen } from "./reopen.ts";
import { detectBrowser, injectOpenTabs, pollTabs, publicTab, snapshotFor } from "./tabs.ts";
import { within } from "./wire.ts";

declare const __AVENIRE_APP_URL__: string;
const appUrl = __AVENIRE_APP_URL__;
const nav = navigator as Navigator & {
  userAgentData?: { brands: { brand: string; version: string }[] };
};
const browser = detectBrowser(nav.userAgentData?.brands ?? [], navigator.userAgent);
const redirects = new Map<number, string>();
let channel: DesktopChannel | undefined;
let tabCache: readonly CapturedTab[] = [];
let polling: Promise<void> | undefined;
let debounce: ReturnType<typeof setTimeout> | undefined;
let capturing = false;
let lastError: string | undefined;
let signedIn: boolean | undefined;

function state(): {
  connected: boolean;
  needsCode: boolean;
  signedIn: boolean | undefined;
  error?: string;
} {
  const pairing = channel?.state;
  return {
    connected: pairing?.connected ?? false,
    needsCode: pairing?.needsCode ?? false,
    signedIn: signedIn ?? pairing?.signedIn,
    ...(lastError ? { error: lastError } : {}),
  };
}
const changed = (pairing: PairingState) => {
  if (pairing.connected) void report();
};

async function report(): Promise<void> {
  if (polling) return polling;
  polling = (async () => {
    const fresh = await pollTabs(chrome, browser, redirects);
    tabCache = fresh.map((tab) => {
      const previous = tabCache.find(
        (entry) =>
          entry.tabId === tab.tabId &&
          entry.url === tab.url &&
          (entry.finalUrl ?? entry.url) === (tab.finalUrl ?? tab.url),
      );
      if (!previous?.access) return tab;
      return {
        ...tab,
        access: previous.access,
        ...(previous.summary ? { summary: previous.summary } : {}),
        ...(previous.access === "open" ? {} : { selection: undefined, position: undefined }),
      };
    });
    await channel?.report(tabCache.map(publicTab));
  })()
    .catch(() => {
      /* A wake or navigation may race a closed window. The next heartbeat refreshes. */
    })
    .finally(() => {
      polling = undefined;
    });
  return polling;
}
function scheduleReport(): void {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    void report();
  }, 250);
}

async function handleRequest(
  message: Extract<ExtensionMessage, { readonly _tag: "CaptureRequest" | "Reopen" }>,
  socket: WebSocket,
): Promise<void> {
  if (message._tag === "Reopen") {
    channel?.send(
      {
        _tag: "ReopenResult",
        version: 1,
        requestId: message.requestId,
        ok: await reopen(chrome, message.url, message.position),
      },
      socket,
    );
    return;
  }
  if (capturing) {
    channel?.send(
      {
        _tag: "CaptureResult",
        version: 1,
        requestId: message.requestId,
        pages: [],
        skipped: (message.tabIds ?? []).map((tabId) => ({
          tabId,
          reason: "Another capture is running",
        })),
      },
      socket,
    );
    return;
  }
  capturing = true;
  const startedAt = Date.now();
  try {
    let tabs = tabCache;
    try {
      tabs = await within(pollTabs(chrome, browser, redirects, message.readInBrowser), 300);
    } catch {
      /* Use pushed tab state when renderers are busy. */
    }
    if (message.tabIds) tabs = tabs.filter((tab) => message.tabIds!.includes(tab.tabId));
    const output = await captureTabs(chrome, tabs, message.readInBrowser, {
      desktop: true,
      totalTimeoutMs: Math.max(0, 8000 - (Date.now() - startedAt)),
    });
    // Access observations must reach desktop before it consumes CaptureResult.
    const observations = new Map(output.tabs.map((tab) => [tab.tabId, tab]));
    tabCache = tabCache.map((tab) => observations.get(tab.tabId) ?? tab);
    channel?.send({ _tag: "TabsReport", version: 1, tabs: tabCache.map(publicTab) }, socket);
    if (!channel?.send(captureResult(message.requestId, output), socket)) return;
    for (const file of output.files) {
      for (const frame of fileFrames(message.requestId, file)) {
        while (socket.bufferedAmount > 2 * 1024 * 1024 && socket.readyState === WebSocket.OPEN)
          await new Promise<void>((resolve) => setTimeout(resolve, 10));
        if (!channel.state.connected || socket.readyState !== WebSocket.OPEN) return;
        socket.send(new Uint8Array(frame));
      }
    }
  } catch {
    channel?.send(
      {
        _tag: "CaptureResult",
        version: 1,
        requestId: message.requestId,
        pages: [],
        skipped: (message.tabIds ?? []).map((tabId) => ({
          tabId,
          reason: "Browser capture failed",
        })),
      },
      socket,
    );
  } finally {
    capturing = false;
  }
}

async function captureCurrentPage(): Promise<{ saved: number; skipped: number; note?: string }> {
  if (capturing) throw new Error("Another capture is running");
  // With the desktop connected, it owns the capture: one toast, local files and the same pipeline.
  if (channel?.state.connected && channel.send({ _tag: "CaptureNow", version: 1 }))
    return { saved: 0, skipped: 0, note: "Capturing with Avenire desktop." };
  capturing = true;
  lastError = undefined;
  try {
    const active = (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
    if (active?.incognito || active?.id === undefined)
      throw new Error("This page cannot be captured");
    const pairing = await fetchPairing(appUrl);
    if (!pairing) throw new Error("Not signed in to Avenire");
    const tabs = await pollTabs(chrome, browser, redirects, pairing.readInBrowser);
    if (!tabs.length) throw new Error("This page is excluded by capture policy");
    const output = await captureTabs(chrome, tabs, pairing.readInBrowser);
    const stored = await chrome.storage.local.get("senderId");
    const snapshot = snapshotFor(output.tabs, String(stored.senderId));
    const result = await uploadCapture(appUrl, snapshot, output);
    signedIn = true;
    return result;
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Capture failed";
    if (lastError === "Not signed in to Avenire") signedIn = false;
    throw error;
  } finally {
    capturing = false;
  }
}

async function boot(): Promise<void> {
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  const stored = await chrome.storage.local.get("senderId");
  const senderId = typeof stored.senderId === "string" ? stored.senderId : crypto.randomUUID();
  if (senderId !== stored.senderId) await chrome.storage.local.set({ senderId });
  channel = new DesktopChannel({
    appUrl,
    senderId,
    browser,
    storage: chrome.storage.local,
    onRequest: handleRequest,
    changed,
  });
  channel.connect();
  await injectOpenTabs(chrome);
  await report();
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (tab.incognito) return;
  if (tab.pendingUrl && tab.pendingUrl !== tab.url) redirects.set(tabId, tab.pendingUrl);
  if (info.status === "loading" && !tab.pendingUrl) redirects.delete(tabId);
  scheduleReport();
});
chrome.tabs.onActivated.addListener(scheduleReport);
chrome.tabs.onCreated.addListener(scheduleReport);
chrome.tabs.onRemoved.addListener((tabId) => {
  redirects.delete(tabId);
  scheduleReport();
});
chrome.windows.onFocusChanged.addListener(scheduleReport);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "avenire-wake") {
    channel?.connect();
    void report();
  }
});
chrome.runtime.onInstalled.addListener(() => {
  channel?.connect();
  void injectOpenTabs(chrome).then(report);
});
chrome.runtime.onStartup.addListener(() => {
  channel?.connect();
  void injectOpenTabs(chrome).then(report);
});
chrome.commands.onCommand.addListener((command) => {
  if (command === "capture")
    void captureCurrentPage()
      .then((result) => {
        void chrome.storage.session.set({
          captureNotice: result.note ?? `Saved ${result.saved} source(s).`,
        });
      })
      .catch(() => {
        void chrome.storage.session.set({ captureNotice: lastError });
      });
});
chrome.runtime.onMessage.addListener((message: unknown, sender, reply) => {
  if (
    sender.id !== chrome.runtime.id ||
    sender.tab ||
    !sender.url?.startsWith(chrome.runtime.getURL("")) ||
    !message ||
    typeof message !== "object" ||
    !("type" in message)
  )
    return;
  if (message.type === "avenire-status") {
    void pairingToken(appUrl)
      .then((auth) => {
        signedIn = !!auth;
        reply(state());
      })
      .catch(() => reply(state()));
    return true;
  }
  if (message.type === "avenire-pair" && "code" in message && typeof message.code === "string") {
    try {
      channel?.pair(message.code);
      reply({ ok: true });
    } catch {
      reply({ ok: false, error: "Enter the six-digit code from Avenire desktop" });
    }
    return;
  }
  if (message.type === "avenire-capture") {
    void captureCurrentPage().then(
      (result) => reply({ ok: true, ...result }),
      () => reply({ ok: false, error: lastError }),
    );
    return true;
  }
});
void chrome.alarms.create("avenire-wake", { periodInMinutes: 0.5 });
setInterval(() => {
  channel?.connect();
  void report();
}, 5000);
void boot();
