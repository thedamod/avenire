import { createHash, randomUUID, type Hash } from "node:crypto";
import { mkdtemp, open, rm, type FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server, IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import * as Schema from "effect/Schema";
import {
  ExtensionMessage,
  type CapturedTab,
  type PageSnapshot,
  MAX_SOURCE_UPLOAD_BYTES,
  type CapturePosition,
} from "@avenire/contracts";
import { normalizeUrl } from "@avenire/capture/url";
import { decodeFileFrame } from "@avenire/capture/frames";
import { PairingAuthority } from "./pairing.ts";

export interface BrowserPage {
  readonly tab: CapturedTab;
  readonly page: PageSnapshot;
  readonly path?: string;
}
interface IncomingFile {
  readonly page: PageSnapshot;
  readonly directory: string;
  readonly path: string;
  file?: FileHandle;
  readonly hash: Hash;
  size: number;
  seq: number;
  done: boolean;
}
interface Pending {
  readonly tabs: readonly CapturedTab[];
  readonly budget: { bytes: number; count: number };
  readonly timer: NodeJS.Timeout;
  readonly resolve: (pages: BrowserPage[]) => void;
  readonly reject: (cause: Error) => void;
  readonly files: Map<string, IncomingFile>;
  readonly pages: BrowserPage[];
  received: boolean;
}
interface Peer {
  readonly socket: WebSocket;
  readonly generation: number;
  sender?: string;
  tabs: readonly CapturedTab[];
  at: number;
  lastSeen: number;
  chain: Promise<void>;
  readonly requests: Map<string, Pending>;
  readonly reopens: Map<string, { resolve: (ok: boolean) => void; timer: NodeJS.Timeout }>;
  readonly directories: Set<string>;
  queuedBytes: number;
}
export class ExtensionChannel {
  private readonly wss = new WebSocketServer({
    noServer: true,
    maxPayload: 1024 * 1024,
    perMessageDeflate: false,
  });
  private readonly peers = new Set<Peer>();
  private generation = 0;
  private heartbeat: NodeJS.Timeout;
  private readonly pairing: PairingAuthority;
  private readonly onCaptureNow: () => void;
  constructor(
    server: Server,
    pairing: PairingAuthority,
    allowed: (request: IncomingMessage) => boolean,
    /** A paired extension's shortcut or popup asked for a capture. */
    onCaptureNow: () => void = () => {},
  ) {
    this.pairing = pairing;
    this.onCaptureNow = onCaptureNow;
    server.on("upgrade", (request, socket, head) => {
      if (request.url !== "/ws" || !allowed(request) || this.peers.size >= 16) {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(request, socket, head, (ws) => this.accept(ws));
    });
    this.heartbeat = setInterval(() => {
      for (const peer of this.peers) {
        if (Date.now() - peer.lastSeen > (peer.sender ? 15_000 : 5000)) peer.socket.terminate();
        else if (peer.sender) this.send(peer, { _tag: "Ping", version: 1 });
      }
    }, 5000);
    this.heartbeat.unref();
  }
  resetOwner() {
    this.generation++;
    for (const peer of this.peers) {
      this.drop(peer);
      peer.socket.close(1008, "Account changed");
    }
  }
  connected() {
    return [...this.peers].some((peer) => peer.sender && peer.socket.readyState === WebSocket.OPEN);
  }
  latestTabs(): readonly CapturedTab[] {
    return [...this.peers].flatMap((peer) =>
      peer.sender && Date.now() - peer.at <= 10_000 ? peer.tabs : [],
    );
  }
  close() {
    clearInterval(this.heartbeat);
    for (const peer of this.peers) {
      this.drop(peer);
      peer.socket.terminate();
    }
    this.wss.close();
  }
  private send(peer: Peer, message: ExtensionMessage) {
    if (peer.socket.readyState === WebSocket.OPEN) peer.socket.send(JSON.stringify(message));
  }
  private valid(peer: Peer) {
    return this.peers.has(peer) && peer.generation === this.generation;
  }
  private accept(socket: WebSocket) {
    const peer: Peer = {
      socket,
      generation: this.generation,
      tabs: [],
      at: 0,
      lastSeen: Date.now(),
      chain: Promise.resolve(),
      requests: new Map(),
      reopens: new Map(),
      directories: new Set(),
      queuedBytes: 0,
    };
    this.peers.add(peer);
    socket.on("error", () => {});
    socket.on("close", () => this.drop(peer));
    socket.on("message", (data, binary) => {
      const buffer = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as Buffer);
      peer.queuedBytes += buffer.length;
      if (peer.queuedBytes > 8 * 1024 * 1024) {
        this.drop(peer);
        socket.close(1009, "Capture input exceeds queue limit");
        return;
      }
      peer.chain = peer.chain
        .then(async () => {
          if (!this.valid(peer)) return;
          if (buffer.length > 1024 * 1024) throw new Error("Message too large");
          if (binary) await this.frame(peer, buffer);
          else await this.message(peer, JSON.parse(buffer.toString("utf8")));
        })
        .catch(() => {
          this.drop(peer);
          socket.close(1008, "Invalid capture message");
        })
        .finally(() => {
          peer.queuedBytes -= buffer.length;
        });
    });
  }
  private async message(peer: Peer, value: unknown) {
    if (!peer.sender) {
      const raw = value as { _tag?: string; version?: number } | null;
      if (raw?._tag !== "Hello" || raw.version !== 1) {
        this.send(peer, {
          _tag: "Rejected",
          version: 1,
          reason: raw?.version !== 1 ? "unsupported-version" : "unpaired",
        });
        peer.socket.close(1008);
        return;
      }
      let hello: ExtensionMessage;
      try {
        hello = Schema.decodeUnknownSync(ExtensionMessage)(value);
      } catch {
        this.send(peer, { _tag: "Rejected", version: 1, reason: "unpaired" });
        peer.socket.close(1008);
        return;
      }
      if (hello._tag !== "Hello") throw new Error("Hello required");
      const auth = await this.pairing.authenticate(hello.auth);
      if (!this.valid(peer)) return;
      if (!auth) {
        this.send(peer, {
          _tag: "Rejected",
          version: 1,
          reason: hello.auth._tag === "Token" ? "account-mismatch" : "unpaired",
        });
        peer.socket.close(1008);
        return;
      }
      peer.sender = hello.senderId;
      peer.lastSeen = Date.now();
      this.send(peer, { _tag: "Welcome", version: 1, ...auth });
      return;
    }
    const message = Schema.decodeUnknownSync(ExtensionMessage)(value);
    peer.lastSeen = Date.now();
    switch (message._tag) {
      case "TabsReport":
        peer.tabs = message.tabs.filter((tab) => !tab.incognito);
        peer.at = Date.now();
        break;
      case "CaptureNow":
        this.onCaptureNow();
        break;
      case "Ping":
        this.send(peer, { _tag: "Pong", version: 1 });
        break;
      case "Pong":
        break;
      case "ReopenResult": {
        const pending = peer.reopens.get(message.requestId);
        if (!pending) throw new Error("Unknown reopen request");
        clearTimeout(pending.timer);
        peer.reopens.delete(message.requestId);
        pending.resolve(message.ok);
        break;
      }
      case "CaptureResult": {
        const pending = peer.requests.get(message.requestId);
        if (
          !pending ||
          pending.received ||
          message.pages.some((page) => !pending.tabs.some((tab) => tab.tabId === page.tabId)) ||
          message.skipped.some((item) => !pending.tabs.some((tab) => tab.tabId === item.tabId))
        )
          throw new Error("Uncorrelated capture result");
        pending.received = true;
        for (const page of message.pages) {
          const tab = pending.tabs.find((tab) => tab.tabId === page.tabId)!;
          if (!page.file) {
            pending.pages.push({ tab, page });
            continue;
          }
          const key = `${page.tabId}:${page.file.sha256}:${pending.files.size}`;
          if (
            page.file.sizeBytes < 1 ||
            page.file.sizeBytes > MAX_SOURCE_UPLOAD_BYTES ||
            pending.budget.bytes + page.file.sizeBytes > MAX_SOURCE_UPLOAD_BYTES ||
            pending.budget.count >= 10
          )
            throw new Error("Capture file limit exceeded");
          pending.budget.bytes += page.file.sizeBytes;
          pending.budget.count++;
          const directory = await mkdtemp(join(tmpdir(), "avenire-browser-source-"));
          peer.directories.add(directory);
          const path = join(directory, "original");
          const incoming: IncomingFile = {
            page,
            directory,
            path,
            hash: createHash("sha256"),
            seq: 0,
            size: 0,
            done: false,
          };
          pending.files.set(key, incoming);
          incoming.file = await open(path, "wx", 0o600);
          pending.pages.push({ tab, page, path });
        }
        if (!pending.files.size) this.complete(peer, message.requestId, pending);
        break;
      }
      default:
        throw new Error("Unexpected extension message");
    }
  }
  private async frame(peer: Peer, bytes: Uint8Array) {
    if (!peer.sender) throw new Error("Authenticate first");
    const decoded = decodeFileFrame(bytes);
    if (!decoded) throw new Error("Malformed file frame");
    const { header, payload } = decoded;
    const pending = peer.requests.get(header.requestId);
    const incoming = [...(pending?.files.values() ?? [])].find(
      (file) =>
        !file.done && file.page.tabId === header.tabId && file.page.file?.sha256 === header.sha256,
    );
    if (!incoming?.file || incoming.done || incoming.seq !== header.seq)
      throw new Error("Uncorrelated file frame");
    incoming.size += payload.byteLength;
    if (incoming.size > incoming.page.file!.sizeBytes)
      throw new Error("File exceeds announced size");
    incoming.hash.update(payload);
    await incoming.file.writeFile(payload);
    incoming.seq++;
    peer.lastSeen = Date.now();
    if (header.final) {
      await incoming.file.close();
      delete incoming.file;
      if (
        incoming.size !== incoming.page.file!.sizeBytes ||
        incoming.hash.digest("hex") !== incoming.page.file!.sha256
      )
        throw new Error("File integrity check failed");
      incoming.done = true;
      if ([...pending!.files.values()].every((file) => file.done))
        this.complete(peer, header.requestId, pending!);
    }
  }
  private complete(peer: Peer, id: string, pending: Pending) {
    if (!this.valid(peer) || peer.requests.get(id) !== pending) return;
    clearTimeout(pending.timer);
    peer.requests.delete(id);
    for (const file of pending.files.values()) peer.directories.delete(file.directory);
    pending.resolve(pending.pages); // Ownership of verified spools passes to the pipeline.
  }
  private fail(peer: Peer, id: string, reason: string) {
    const pending = peer.requests.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    peer.requests.delete(id);
    pending.reject(new Error(reason));
    // Wait for an in-flight frame write before deleting its private spool.
    void peer.chain
      .then(async () => {
        for (const file of pending.files.values()) {
          await file.file?.close().catch(() => {});
          peer.directories.delete(file.directory);
          await rm(file.directory, { recursive: true, force: true });
        }
      })
      .catch(() => {});
  }
  private drop(peer: Peer) {
    if (!this.peers.delete(peer)) return;
    for (const id of peer.requests.keys())
      this.fail(peer, id, "Browser disconnected; reconnect the extension and capture again.");
    for (const pending of peer.reopens.values()) {
      clearTimeout(pending.timer);
      pending.resolve(false);
    }
    peer.reopens.clear();
    peer.tabs = [];
    void peer.chain
      .then(async () => {
        for (const directory of peer.directories)
          await rm(directory, { recursive: true, force: true });
        peer.directories.clear();
      })
      .catch(() => {});
  }
  async capture(
    tabs: readonly CapturedTab[],
    readInBrowser: boolean,
    signal?: AbortSignal,
    onPage?: (page: BrowserPage) => Promise<void>,
    onFailure?: (tab: CapturedTab, reason: string) => void,
  ): Promise<BrowserPage[]> {
    const deadline = Date.now() + 4000;
    const budget = { bytes: 0, count: 0 };
    const work: Promise<void>[] = [];
    const pages: BrowserPage[] = [];
    // One request per peer per batch, at most four tabs globally. The extension also bounds
    // its four extraction workers; concurrent requests must not trip its single-flight guard.
    for (
      let offset = 0;
      offset < tabs.length && Date.now() < deadline && !signal?.aborted;
      offset += 4
    ) {
      const groups = new Map<Peer, CapturedTab[]>();
      for (const tab of tabs.slice(offset, offset + 4)) {
        const peer = [...this.peers].find(
          (peer) =>
            peer.sender &&
            peer.tabs.some(
              (entry) =>
                entry === tab ||
                (entry.tabId === tab.tabId &&
                  entry.windowId === tab.windowId &&
                  entry.browser === tab.browser &&
                  entry.url === tab.url),
            ),
        );
        if (peer) groups.set(peer, [...(groups.get(peer) ?? []), tab]);
      }
      await Promise.all(
        [...groups].map(async ([peer, selected]) => {
          const requestId = randomUUID();
          const abort = () => this.fail(peer, requestId, "Capture cancelled");
          try {
            const extracted = await new Promise<BrowserPage[]>((resolve, reject) => {
              const timer = setTimeout(
                () =>
                  this.fail(
                    peer,
                    requestId,
                    "Browser extraction timed out; try capturing this tab again.",
                  ),
                Math.min(2500, deadline - Date.now()),
              );
              peer.requests.set(requestId, {
                tabs: selected,
                budget,
                timer,
                resolve,
                reject,
                files: new Map(),
                pages: [],
                received: false,
              });
              signal?.addEventListener("abort", abort, { once: true });
              if (signal?.aborted) {
                abort();
                return;
              }
              this.send(peer, {
                _tag: "CaptureRequest",
                version: 1,
                requestId,
                tabIds: selected.map((tab) => tab.tabId),
                readInBrowser,
              });
            });
            pages.push(...extracted);
            if (onPage) work.push(...extracted.map(onPage));
          } catch {
            for (const tab of selected)
              onFailure?.(
                tab,
                "Browser capture could not finish. Reconnect the extension and capture again.",
              );
          } finally {
            signal?.removeEventListener("abort", abort);
          }
        }),
      );
    }
    await Promise.all(work);
    return pages;
  }
  async release(page: BrowserPage) {
    if (!page.path) return;
    const directory = join(page.path, "..");
    for (const peer of this.peers) peer.directories.delete(directory);
    await rm(directory, { recursive: true, force: true });
  }
  async reopen(url: string, position?: CapturePosition): Promise<boolean> {
    const peers = [...this.peers].filter((peer) => peer.sender);
    const peer =
      peers.find((peer) =>
        peer.tabs.some((tab) => normalizeUrl(tab.finalUrl ?? tab.url) === normalizeUrl(url)),
      ) ?? peers[0];
    if (!peer) return false;
    const requestId = randomUUID();
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        peer.reopens.delete(requestId);
        resolve(false);
      }, 2000);
      peer.reopens.set(requestId, { resolve, timer });
      this.send(peer, {
        _tag: "Reopen",
        version: 1,
        requestId,
        url,
        ...(position ? { position } : {}),
      });
    });
  }
}
