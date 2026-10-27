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
import { isEngaged } from "@avenire/capture/candidates";
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
  readonly budget: { bytes: number };
  readonly counts: Map<number, number>;
  readonly seen: Set<number>;
  readonly ignoredFiles: Set<string>;
  readonly delivered: Set<BrowserPage>;
  readonly onPage: (page: BrowserPage) => void;
  readonly onFailure: (tab: CapturedTab, reason: string) => void;
  readonly timer: NodeJS.Timeout;
  readonly resolve: (pages: BrowserPage[]) => void;
  readonly reject: (cause: Error) => void;
  readonly files: Map<string, IncomingFile>;
  readonly pages: BrowserPage[];
  final: boolean;
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
  readonly expired: Map<string, number>;
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
      expired: new Map(),
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
  private expired(peer: Peer, id: string): boolean {
    for (const [key, until] of peer.expired) if (until <= Date.now()) peer.expired.delete(key);
    return peer.expired.has(id);
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
        if (this.expired(peer, message.requestId)) return;
        const pending = peer.requests.get(message.requestId);
        if (!pending || pending.final) return;
        // A partial settles a tab, with all its page/file metadata in the same message.
        // Unknown tabs and duplicate partials are ignored without disturbing this peer.
        const accepted = new Set<number>();
        for (const item of [...message.pages, ...message.skipped])
          if (pending.tabs.some((tab) => tab.tabId === item.tabId) && !pending.seen.has(item.tabId))
            accepted.add(item.tabId);
        if ((message.pages.length || message.skipped.length) && !accepted.size) return;
        for (const id of accepted) pending.seen.add(id);
        for (const item of message.skipped) {
          const tab = pending.tabs.find((tab) => tab.tabId === item.tabId);
          if (tab && accepted.has(tab.tabId)) pending.onFailure(tab, item.reason);
        }
        pending.final = message.final !== false;
        for (const page of message.pages) {
          if (!accepted.has(page.tabId)) continue;
          const tab = pending.tabs.find((tab) => tab.tabId === page.tabId)!;
          if (!page.file) {
            const result = { tab, page };
            pending.pages.push(result);
            this.deliver(peer, pending, result);
            continue;
          }
          const key = `${page.tabId}:${page.file.sha256}`;
          if (pending.files.has(key)) continue;
          const count = pending.counts.get(page.tabId) ?? 0;
          if (
            page.file.sizeBytes < 1 ||
            page.file.sizeBytes > MAX_SOURCE_UPLOAD_BYTES ||
            pending.budget.bytes + page.file.sizeBytes > 1024 * 1024 * 1024 ||
            (!page.file.primary && count >= 10)
          ) {
            pending.ignoredFiles.add(key);
            pending.onFailure(tab, "Capture file limit exceeded; document skipped");
            continue;
          }
          pending.budget.bytes += page.file.sizeBytes;
          if (!page.file.primary) pending.counts.set(page.tabId, count + 1);
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
          if (!this.valid(peer) || peer.requests.get(message.requestId) !== pending) return;
          pending.pages.push({ tab, page, path });
        }
        this.maybeComplete(peer, message.requestId, pending);
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
    if (this.expired(peer, header.requestId)) return;
    const pending = peer.requests.get(header.requestId);
    if (!pending) return;
    if (
      !pending.tabs.some((tab) => tab.tabId === header.tabId) ||
      pending.ignoredFiles.has(`${header.tabId}:${header.sha256}`)
    )
      return;
    const previous = pending.files.get(`${header.tabId}:${header.sha256}`);
    if (previous?.done) return;
    const incoming = [...pending.files.values()].find(
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
      if (!this.valid(peer) || peer.requests.get(header.requestId) !== pending) return;
      incoming.done = true;
      const result = pending.pages.find((page) => page.path === incoming.path)!;
      this.deliver(peer, pending, result);
      this.maybeComplete(peer, header.requestId, pending);
    }
  }
  private deliver(peer: Peer, pending: Pending, page: BrowserPage) {
    if (pending.delivered.has(page)) return;
    pending.delivered.add(page);
    if (page.path) peer.directories.delete(join(page.path, ".."));
    pending.onPage(page); // The pipeline now owns verified spools, including on timeout/disconnect.
  }
  private maybeComplete(peer: Peer, id: string, pending: Pending) {
    if (pending.final && [...pending.files.values()].every((file) => file.done))
      this.complete(peer, id, pending);
  }
  private complete(peer: Peer, id: string, pending: Pending) {
    if (!this.valid(peer) || peer.requests.get(id) !== pending) return;
    clearTimeout(pending.timer);
    peer.requests.delete(id);
    this.expired(peer, id);
    if (peer.expired.size >= 512) peer.expired.delete(peer.expired.keys().next().value!);
    peer.expired.set(id, Date.now() + 30_000);
    for (const tab of pending.tabs)
      if (!pending.seen.has(tab.tabId)) pending.onFailure(tab, "Read in browser timed out");
    pending.resolve(pending.pages); // Ownership of verified spools passes to the pipeline.
  }
  private fail(peer: Peer, id: string, reason: string) {
    const pending = peer.requests.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    peer.requests.delete(id);
    this.expired(peer, id);
    if (peer.expired.size >= 512) peer.expired.delete(peer.expired.keys().next().value!);
    peer.expired.set(id, Date.now() + 30_000);
    pending.reject(new Error(reason));
    // Wait for an in-flight frame write before deleting its private spool.
    void peer.chain
      .then(async () => {
        for (const file of pending.files.values()) {
          if (file.done) continue;
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
    const deadline = Date.now() + 20_000;
    const budget = { bytes: 0 };
    const work: Promise<void>[] = [];
    const pages: BrowserPage[] = [];
    const groups = new Map<Peer, CapturedTab[]>();
    const ordered = [...tabs].sort(
      (a, b) =>
        Number(b.activeInWindow) - Number(a.activeInWindow) ||
        Number(isEngaged(b)) - Number(isEngaged(a)),
    );
    for (const tab of ordered) {
      const peer = [...this.peers].find(
        (peer) =>
          peer.sender &&
          peer.tabs.some(
            (entry) =>
              entry.tabId === tab.tabId &&
              entry.windowId === tab.windowId &&
              entry.browser === tab.browser &&
              entry.url === tab.url,
          ),
      );
      if (peer) groups.set(peer, [...(groups.get(peer) ?? []), tab]);
      else
        onFailure?.(tab, "Browser content unavailable; reconnect the extension and capture again");
    }
    await Promise.all(
      [...groups].map(async ([peer, selected]) => {
        const requestId = randomUUID();
        const deadlineMs = Math.max(1, deadline - Date.now());
        const delivered = new Set<number>();
        const abort = () => this.fail(peer, requestId, "Capture cancelled");
        try {
          await new Promise<BrowserPage[]>((resolve, reject) => {
            const timer = setTimeout(
              () => this.fail(peer, requestId, "Read in browser timed out"),
              deadlineMs,
            );
            peer.requests.set(requestId, {
              tabs: selected,
              budget,
              timer,
              resolve,
              reject,
              files: new Map(),
              pages: [],
              final: false,
              counts: new Map(),
              seen: new Set(),
              ignoredFiles: new Set(),
              delivered: new Set(),
              onFailure: (tab, reason) => onFailure?.(tab, reason),
              onPage: (page) => {
                pages.push(page);
                delivered.add(page.tab.tabId);
                if (onPage)
                  work.push(
                    Promise.resolve()
                      .then(() => onPage(page))
                      .catch(() => {
                        onFailure?.(page.tab, "Browser source upload failed; capture again");
                      }),
                  );
              },
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
              deadlineMs,
              readInBrowser,
            });
          });
        } catch (error) {
          for (const tab of selected)
            if (!delivered.has(tab.tabId))
              onFailure?.(
                tab,
                error instanceof Error ? error.message : "Read in browser timed out",
              );
        } finally {
          signal?.removeEventListener("abort", abort);
        }
      }),
    );
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
