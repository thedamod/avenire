import * as Http from "node:http";

import { CapturedTab, ExtensionAuth } from "@avenire/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { ExtensionChannel } from "./channel.ts";
import type { PairingAuthority } from "./pairing.ts";
import { extensionReceiverPort, extensionIds } from "../config.ts";

const reports = new Map<string, { readonly tabs: readonly CapturedTab[]; readonly at: number }>();

const decodeTabsReport = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      senderId: Schema.NonEmptyString.check(Schema.isMaxLength(200)),
      auth: ExtensionAuth,
      _tag: Schema.Literal("TabsReport"),
      version: Schema.Literal(1),
      tabs: Schema.Array(CapturedTab).check(Schema.isMaxLength(200)),
    }),
  ),
);
export let extensionChannel: ExtensionChannel | undefined;
let ownerEpoch = 0;
export function resetTabsOwner() {
  ownerEpoch++;
  reports.clear();
  extensionChannel?.resetOwner();
}
let server: Http.Server | undefined;
let listening = false;

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * Only the Avenire extension may report tabs: the request must come from this machine,
 * and from an extension origin rather than a web page (which could otherwise POST here).
 */
export function isFromExtension(request: Http.IncomingMessage): boolean {
  if (!LOOPBACK_ADDRESSES.has(request.socket.remoteAddress ?? "")) return false;
  const origin = request.headers.origin;
  if (origin === undefined) return false;
  try {
    const url = new URL(origin);
    return (
      url.protocol === "chrome-extension:" &&
      extensionIds.has(url.hostname) &&
      origin === `chrome-extension://${url.hostname}`
    );
  } catch {
    return false;
  }
}

export function startTabsReceiver(
  pairing?: PairingAuthority,
  onCaptureNow?: () => void,
): Http.Server {
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
      if (size > 1024 * 1024) request.destroy();
      else chunks.push(chunk);
    });
    request.on("end", async () => {
      const decoded = decodeTabsReport(Buffer.concat(chunks).toString("utf8"));
      if (Option.isNone(decoded)) {
        response.writeHead(400).end();
        return;
      }
      const value = decoded.value;
      const { tabs, senderId: sender, auth } = value;
      const epoch = ownerEpoch;
      if (
        !pairing ||
        auth._tag === "Code" ||
        !(await pairing.authenticate(auth)) ||
        epoch !== ownerEpoch
      ) {
        response.writeHead(403).end();
        return;
      }
      if (tabs.length > 200) {
        response.writeHead(413).end();
        return;
      }
      if (!reports.has(sender) && reports.size >= 16) reports.delete(reports.keys().next().value!);
      reports.set(sender, { tabs: tabs.filter((tab) => !tab.incognito), at: Date.now() });
      response.writeHead(204).end();
    });
  });
  if (pairing)
    extensionChannel = new ExtensionChannel(server, pairing, isFromExtension, onCaptureNow);
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
  extensionChannel?.close();
  extensionChannel = undefined;
  server?.closeAllConnections();
  server?.close();
  server = undefined;
  reports.clear();
  listening = false;
}

export function latestTabs(): readonly CapturedTab[] {
  const tabs: CapturedTab[] = [...(extensionChannel?.latestTabs() ?? [])];
  for (const [sender, report] of reports) {
    if (Date.now() - report.at > 10_000) {
      reports.delete(sender);
      continue;
    }
    tabs.push(...report.tabs);
  }
  return tabs.slice(0, 200);
}
