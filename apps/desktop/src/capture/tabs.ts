import * as Http from "node:http";
import * as Schema from "effect/Schema";
import { CapturedTab } from "@avenire/contracts";
import type { CapturedTab as CapturedTabType } from "@avenire/contracts";
import { extensionReceiverPort } from "../config.ts";

let report: { readonly tabs: readonly CapturedTabType[]; readonly at: number } | undefined;
let server: Http.Server | undefined;

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const EXTENSION_PROTOCOLS = new Set([
  "chrome-extension:",
  "moz-extension:",
  "safari-web-extension:",
]);

/**
 * Only the Avenire extension may report tabs: the request must come from this machine,
 * and from an extension origin rather than a web page (which could otherwise POST here).
 */
function isFromExtension(request: Http.IncomingMessage): boolean {
  if (!LOOPBACK_ADDRESSES.has(request.socket.remoteAddress ?? "")) return false;
  const origin = request.headers.origin;
  if (origin === undefined) return false;
  try {
    return EXTENSION_PROTOCOLS.has(new URL(origin).protocol);
  } catch {
    return false;
  }
}

export function startTabsReceiver(): void {
  if (server) return;
  server = Http.createServer((request, response) => {
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
      try {
        const decoded = Schema.decodeUnknownSync(Schema.Array(CapturedTab))(
          JSON.parse(Buffer.concat(chunks).toString("utf8")),
        );
        report = { tabs: decoded, at: Date.now() };
        response.writeHead(204).end();
      } catch {
        response.writeHead(400).end();
      }
    });
  });
  server.listen(extensionReceiverPort, "127.0.0.1");
}

export function latestTabs(): readonly CapturedTabType[] {
  if (!report || Date.now() - report.at > 10_000) return [];
  return report.tabs.filter(
    (tab) =>
      tab.activeInWindow ||
      tab.engagement.dwellMs >= 8_000 ||
      tab.engagement.scrollDepthPct >= 15 ||
      tab.engagement.mediaPlaying,
  );
}
