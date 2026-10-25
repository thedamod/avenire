import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";
import { shell } from "electron";

export function isProviderAuthUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "accounts.google.com" &&
      !url.port &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

/** The browser completes provider OAuth; a short-lived token signs the desktop cookie jar in. */
export class DesktopAuth {
  private server: Server | undefined;
  private timeout: NodeJS.Timeout | undefined;
  private browserUrl: string | undefined;
  private busy = false;
  private readonly appUrl: string;
  private readonly session: Electron.Session;
  private readonly completed: () => void;
  private readonly failed: (error: unknown) => void;

  constructor(
    appUrl: string,
    session: Electron.Session,
    completed: () => void,
    failed: (error: unknown) => void,
  ) {
    this.appUrl = appUrl;
    this.session = session;
    this.completed = completed;
    this.failed = failed;
  }

  async start(): Promise<void> {
    if (this.browserUrl) {
      await shell.openExternal(this.browserUrl);
      return;
    }
    if (this.server) return;
    const state = randomBytes(32).toString("hex");
    const server = createServer((request, response) => {
      request.on("error", () => {});
      response.on("error", () => {});
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const supplied = url.searchParams.get("state") ?? "";
      const token = url.searchParams.get("token") ?? "";
      if (
        request.method !== "GET" ||
        url.pathname !== "/callback" ||
        this.busy ||
        !/^[a-f0-9]{64}$/.test(supplied) ||
        !timingSafeEqual(Buffer.from(state), Buffer.from(supplied)) ||
        !/^[A-Za-z0-9_-]{16,256}$/.test(token)
      ) {
        response.writeHead(400).end("This sign-in request is invalid or expired.");
        return;
      }
      this.busy = true;
      // No token, session, source URL or callback query is reflected into this response.
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      });
      response.end(
        "<!doctype html><title>Avenire sign-in</title><h1>Return to Avenire</h1><p>Your sign-in is being completed in the desktop app. You can close this tab.</p>",
      );
      void this.verify(token)
        .then(() => this.completed())
        .catch(this.failed)
        .finally(() => this.close());
    });
    this.server = server;
    server.requestTimeout = 5000;
    server.headersTimeout = 5000;
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("Could not start desktop sign-in.");
      const target = new URL("/desktop/authorize", this.appUrl);
      target.searchParams.set("port", String(address.port));
      target.searchParams.set("state", state);
      this.browserUrl = target.href;
      this.timeout = setTimeout(() => {
        this.close();
        this.failed(new Error("Desktop sign-in expired. Try again."));
      }, 5 * 60_000);
      this.timeout.unref();
      await shell.openExternal(this.browserUrl);
    } catch (error) {
      this.close();
      throw error;
    }
  }

  private async verify(token: string): Promise<void> {
    const response = await this.session.fetch(
      new URL("/api/auth/one-time-token/verify", this.appUrl).href,
      {
        method: "POST",
        credentials: "include",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        headers: { "content-type": "application/json", origin: this.appUrl },
        body: JSON.stringify({ token }),
      },
    );
    if (!response.ok) throw new Error("Desktop sign-in could not be completed. Try again.");
    // Electron net.fetch does not automatically persist response cookies in every version.
    // Explicitly install Better Auth's cookies with the response's trusted application origin.
    for (const header of response.headers.getSetCookie()) {
      const [pair = "", ...attributes] = header.split(";");
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;
      const name = pair.slice(0, separator).trim();
      if (!/^(?:__Secure-)?better-auth\./.test(name)) continue;
      const cookie: Electron.CookiesSetDetails = {
        url: this.appUrl,
        name,
        value: pair.slice(separator + 1),
        path: "/",
        httpOnly: true,
        secure: new URL(this.appUrl).protocol === "https:",
        sameSite: "lax",
      };
      for (const attribute of attributes) {
        const [key, ...parts] = attribute.trim().split("=");
        const value = parts.join("=");
        if (key?.toLowerCase() === "max-age" && /^\d+$/.test(value))
          cookie.expirationDate = Date.now() / 1000 + Number(value);
      }
      await this.session.cookies.set(cookie);
    }
    await response.body?.cancel();
  }

  close(): void {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = undefined;
    this.server?.closeAllConnections();
    this.server?.close();
    this.server = undefined;
    this.browserUrl = undefined;
    this.busy = false;
  }
}
