import { isEngaged } from "@avenire/capture/candidates";
import * as Http from "node:http";

import { CapturedTab } from "@avenire/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { extensionReceiverPort, extensionIds } from "../config.ts";

const reports = new Map<string, { readonly tabs: readonly CapturedTab[]; readonly at: number }>();

const decodeTabsReport = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Union([
      Schema.Array(CapturedTab),
      Schema.Struct({ senderId: Schema.String, tabs: Schema.Array(CapturedTab) }),
    ]),
  ),
);
let server: Http.Server | undefined;
let listening = false;

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * Only the Avenire extension may report tabs: the request must come from this machine,
 * and from an extension origin rather than a web page (which could otherwise POST here).
 */
function isFromExtension(request: Http.IncomingMessage): boolean {
  if (!LOOPBACK_ADDRESSES.has(request.socket.remoteAddress ?? "")) return false;
  const origin = request.headers.origin;
  if (origin === undefined) return false;
  try {
    const url = new URL(origin);
    return url.protocol === "chrome-extension:" && extensionIds.has(url.hostname);
  } catch {
    return false;
  }
}

export function startTabsReceiver(): Http.Server {
  if (server) return server;
  server = Http.createServer((request, response) => {
    request.on("error", () => {});
    response.on("error", () => {});
    if (request.method !== "POST" || request.url !== "/tabs" || !isFromExtension(request)) {
      response.writeHead(403).end();
      return;
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    request.on("data", (chunk: Uint8Array) => {
      size += chunk.byteLength;
      if (size > 1_000_000) request.destroy();
      else chunks.push(chunk);
    });
    request.on("end", () => {
      const decoded = decodeTabsReport(Buffer.concat(chunks).toString("utf8"));
      if (Option.isNone(decoded)) {
        response.writeHead(400).end();
        return;
      }
      const value = decoded.value;
      const tabs = Array.isArray(value)
        ? (value as readonly CapturedTab[])
        : (value as { tabs: readonly CapturedTab[] }).tabs;
      const sender = Array.isArray(value)
        ? "legacy"
        : (value as { senderId: string }).senderId.slice(0, 200);
      if (tabs.length > 200) {
        response.writeHead(413).end();
        return;
      }
      if (!reports.has(sender) && reports.size >= 16) reports.delete(reports.keys().next().value!);
      reports.set(sender, { tabs: tabs.filter((tab) => !tab.incognito), at: Date.now() });
      response.writeHead(204).end();
    });
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.on("error", () => {
    listening = false;
    console.warn("Browser capture receiver unavailable; document capture is still available.");
  });
  server.listen(extensionReceiverPort, "127.0.0.1", () => {
    listening = true;
  });
  return server;
}

export function tabsReceiverAvailable(): boolean {
  return listening;
}
export function stopTabsReceiver(): void {
  server?.closeAllConnections();
  server?.close();
  server = undefined;
  reports.clear();
  listening = false;
}

export function latestTabs(): readonly CapturedTab[] {
  const tabs: CapturedTab[] = [];
  for (const [sender, report] of reports) {
    if (Date.now() - report.at > 10_000) {
      reports.delete(sender);
      continue;
    }
    tabs.push(...report.tabs);
  }
  return tabs.filter((tab) => tab.activeInWindow || isEngaged(tab)).slice(0, 200);
}
