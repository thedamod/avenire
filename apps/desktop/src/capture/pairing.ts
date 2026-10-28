import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { ExtensionAuth } from "@avenire/contracts";
import type { AvenireUploadFetch } from "./source-acquisition.ts";
import { atomicJson, ownerKey } from "./registry.ts";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const equal = (a: string, b: string) =>
  timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
export class PairingAuthority {
  private owner: string | undefined;
  private token: string | undefined;
  private generation = 0;
  private code: { owner: string; value: string; expiresAt: number } | undefined;
  private secrets: Record<string, string[]> = {};
  private tail: Promise<void> = Promise.resolve();
  private readonly path: string;
  constructor(path: string) {
    this.path = path;
  }
  async load() {
    try {
      const value = JSON.parse(await readFile(this.path, "utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Invalid extension pairings");
      this.secrets = value;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
    }
  }
  setOwner(owner: string | undefined) {
    if (this.owner === owner) return;
    this.generation++;
    this.owner = owner;
    this.token = undefined;
    this.code = undefined;
  }
  setToken(owner: string, token: string) {
    if (owner === this.owner && /^[A-Za-z0-9_-]{43}$/.test(token)) this.token = token;
  }
  async refreshToken(
    owner: string,
    installId: string,
    appUrl: string,
    session: Promise<AvenireUploadFetch>,
  ): Promise<void> {
    const generation = this.generation;
    const fetch = await session;
    const response = await fetch(
      new URL(`/api/capture/pairing?installId=${encodeURIComponent(installId)}`, appUrl).href,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) return;
    const value = (await response.json()) as { token?: unknown };
    if (generation === this.generation && typeof value.token === "string")
      this.setToken(owner, value.token);
  }
  issueCode(): string {
    if (!this.owner) throw new Error("Sign in to Avenire before pairing the extension.");
    const value = String(randomInt(0, 1_000_000)).padStart(6, "0");
    this.code = { owner: this.owner, value, expiresAt: Date.now() + 10 * 60_000 };
    return value;
  }
  async authenticate(auth: ExtensionAuth): Promise<{ secret?: string } | undefined> {
    const owner = this.owner;
    if (!owner) return undefined;
    if (auth._tag === "Token") return this.token && equal(this.token, auth.token) ? {} : undefined;
    const key = ownerKey(owner);
    if (auth._tag === "Secret")
      return this.secrets[key]?.includes(digest(auth.secret)) ? {} : undefined;
    if (
      !this.code ||
      this.code.owner !== owner ||
      this.code.expiresAt <= Date.now() ||
      !equal(this.code.value, auth.code)
    )
      return undefined;
    this.code = undefined; // Consume before any await: concurrent Hellos cannot reuse a code.
    const secret = randomBytes(32).toString("base64url");
    const task = this.tail.then(async () => {
      if (this.owner !== owner) throw new Error("Account changed during pairing");
      const secrets = {
        ...this.secrets,
        [key]: [...(this.secrets[key] ?? []), digest(secret)].slice(-32),
      };
      await atomicJson(this.path, secrets);
      this.secrets = secrets;
    });
    this.tail = task.catch(() => {});
    await task;
    return this.owner === owner ? { secret } : undefined;
  }
}
