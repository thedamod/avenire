import {
  ExtensionMessage,
  type BrowserKind,
  type CapturedTab,
  type ExtensionAuth,
} from "@avenire/contracts";
import * as Schema from "effect/Schema";
import { chooseAuth, initialPairing, pairingTransition, type PairingState } from "./pairing.ts";
import { decodeMessage, MAX_MESSAGE_BYTES } from "./wire.ts";

export interface ChannelOptions {
  readonly appUrl: string;
  readonly senderId: string;
  readonly browser: BrowserKind;
  readonly storage: chrome.storage.StorageArea;
  readonly onRequest: (
    message: Extract<ExtensionMessage, { readonly _tag: "CaptureRequest" | "Reopen" }>,
    socket: WebSocket,
  ) => Promise<void>;
  readonly changed: (state: PairingState) => void;
}

export class DesktopChannel {
  private socket: WebSocket | undefined;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private keepalive: ReturnType<typeof setInterval> | undefined;
  private handshake: ReturnType<typeof setTimeout> | undefined;
  private attempt = 0;
  private code: string | undefined;
  private seen = new Set<string>();
  private fallbackAuth: ExtensionAuth | undefined;
  state: PairingState = initialPairing;
  private readonly options: ChannelOptions;
  constructor(options: ChannelOptions) {
    this.options = options;
  }

  private update(state: PairingState): void {
    this.state = state;
    this.options.changed(state);
  }
  connect(): void {
    if (this.retry) return;
    if (this.socket && this.socket.readyState < WebSocket.CLOSING) return;
    const socket = new WebSocket("ws://127.0.0.1:17842/ws");
    this.socket = socket;
    this.handshake = setTimeout(() => socket.close(), 12_000);
    socket.onopen = () => {
      void this.hello(socket).catch(() => socket.close());
    };
    socket.onmessage = (event: MessageEvent<unknown>) => {
      const message = decodeMessage(event.data);
      if (!message || this.socket !== socket) return;
      if (message._tag === "Welcome") {
        if (this.state.connected) return;
        clearTimeout(this.handshake);
        this.attempt = 0;
        // Persist the rotated secret before allowing new capture requests.
        void (
          message.secret
            ? this.options.storage.set({ pairingSecret: message.secret })
            : Promise.resolve()
        )
          .then(() => {
            if (socket !== this.socket || socket.readyState !== WebSocket.OPEN) return;
            if (message.secret) this.fallbackAuth = { _tag: "Secret", secret: message.secret };
            this.code = undefined;
            this.update(pairingTransition(this.state, message));
            this.keepalive = setInterval(() => {
              this.send({ _tag: "Ping", version: 1 });
            }, 20_000);
          })
          .catch(() => socket.close());
      } else if (message._tag === "Rejected") {
        this.update(pairingTransition(this.state, message));
        // A stale secret must not prevent token/code pairing on the next wake.
        this.fallbackAuth = undefined;
        void this.options.storage.remove("pairingSecret");
        this.code = undefined;
        socket.close();
      } else if (this.state.connected) {
        if (message._tag === "Ping") this.send({ _tag: "Pong", version: 1 });
        if (
          (message._tag === "CaptureRequest" || message._tag === "Reopen") &&
          !this.seen.has(message.requestId)
        ) {
          if (this.seen.size >= 512) return;
          this.seen.add(message.requestId);
          void this.options.onRequest(message, socket).catch(() => {
            /* Request executor reports failures; a closed socket is discarded. */
          });
        }
      }
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      clearTimeout(this.handshake);
      clearInterval(this.keepalive);
      this.socket = undefined;
      this.seen.clear();
      this.update(pairingTransition(this.state, "disconnect"));
      const delay = [1000, 2000, 5000, 10_000, 30_000][Math.min(this.attempt++, 4)]!;
      this.retry = setTimeout(() => {
        this.retry = undefined;
        this.connect();
      }, delay);
    };
    socket.onerror = () => socket.close();
  }

  private async hello(socket: WebSocket): Promise<void> {
    const auth = await chooseAuth(this.options.storage, this.options.appUrl, this.code);
    if (this.socket !== socket || socket.readyState !== WebSocket.OPEN) return;
    if (!auth) {
      this.update({ ...this.state, signedIn: false, needsCode: true });
      socket.close();
      return;
    }
    if (auth._tag === "Token") this.update({ ...this.state, signedIn: true });
    if (auth._tag !== "Code") this.fallbackAuth = auth;
    const hello: ExtensionMessage = {
      _tag: "Hello",
      version: 1,
      senderId: this.options.senderId,
      browser: this.options.browser,
      extensionVersion: chrome.runtime.getManifest().version,
      auth,
    };
    socket.send(JSON.stringify(Schema.decodeUnknownSync(ExtensionMessage)(hello)));
  }

  pair(code: string): void {
    Schema.decodeUnknownSync(ExtensionMessage)({
      _tag: "Hello",
      version: 1,
      senderId: this.options.senderId,
      browser: this.options.browser,
      extensionVersion: "0.1.0",
      auth: { _tag: "Code", code },
    });
    this.code = code;
    clearTimeout(this.retry);
    this.retry = undefined;
    if (this.socket) {
      const previous = this.socket;
      this.socket = undefined;
      previous.close();
    }
    clearInterval(this.keepalive);
    clearTimeout(this.handshake);
    this.update({ ...this.state, connected: false });
    this.connect();
  }

  send(message: ExtensionMessage, socket = this.socket): boolean {
    if (
      !this.state.connected ||
      !socket ||
      socket !== this.socket ||
      socket.readyState !== WebSocket.OPEN
    )
      return false;
    const encoded = JSON.stringify(Schema.decodeUnknownSync(ExtensionMessage)(message));
    if (new TextEncoder().encode(encoded).byteLength > MAX_MESSAGE_BYTES) return false;
    socket.send(encoded);
    return true;
  }

  async report(tabs: readonly CapturedTab[]): Promise<void> {
    const message: ExtensionMessage = { _tag: "TabsReport", version: 1, tabs };
    if (this.send(message)) return;
    try {
      const auth =
        this.fallbackAuth ?? (await chooseAuth(this.options.storage, this.options.appUrl));
      if (!auth || auth._tag === "Code") return;
      this.fallbackAuth = auth;
      await fetch("http://127.0.0.1:17842/tabs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...message, senderId: this.options.senderId, auth }),
        signal: AbortSignal.timeout(1000),
      });
    } catch {
      /* Desktop is not running; direct mode remains available. */
    }
  }
}
