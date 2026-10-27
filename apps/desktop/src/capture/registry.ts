import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function atomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600, flag: "wx" });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
export const ownerKey = (owner: string) => createHash("sha256").update(owner).digest("hex");
export interface RegisteredDownload {
  readonly path: string;
  readonly sizeBytes: number;
  readonly download: {
    readonly captureId: string;
    readonly startedAt: number;
    readonly endedAt: number;
    readonly url: string;
  };
}
export interface LocalOrigin {
  /** Desktop-validated capture window; permits safe browser reuse after reconnection/restart. */
  readonly download?: RegisteredDownload["download"] & { readonly reportedPath?: string };
  readonly originUrl?: string;
  readonly path: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly mtimeMs: number;
  readonly appName?: string;
}

/** Only native acquisition calls record. Account partitions never cross a renderer boundary. */
export class LocalOriginRegistry {
  private owners: Record<string, Record<string, LocalOrigin>> = {};
  private tail: Promise<void> = Promise.resolve();
  private readonly path: string;
  constructor(path: string) {
    this.path = path;
  }
  async load(): Promise<void> {
    try {
      const value = JSON.parse(await readFile(this.path, "utf8"));
      if (!value || value.version !== 1 || typeof value.owners !== "object" || !value.owners)
        throw new Error("Invalid local origin registry");
      this.owners = value.owners;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
    }
  }
  get(owner: string, fileId: string): LocalOrigin | undefined {
    const value = this.owners[ownerKey(owner)]?.[fileId];
    return value &&
      typeof value.path === "string" &&
      /^[a-f0-9]{64}$/.test(value.sha256) &&
      Number.isFinite(value.sizeBytes) &&
      Number.isFinite(value.mtimeMs)
      ? { ...value }
      : undefined;
  }
  downloads(owner: string): RegisteredDownload[] {
    return Object.keys(this.owners[ownerKey(owner)] ?? {})
      .flatMap((id) => {
        const entry = this.get(owner, id);
        const download = entry?.download;
        return entry &&
          download &&
          /^[a-zA-Z0-9_-]{1,200}$/.test(download.captureId) &&
          Number.isFinite(download.startedAt) &&
          Number.isFinite(download.endedAt) &&
          typeof download.url === "string"
          ? [
              {
                path:
                  typeof download.reportedPath === "string" ? download.reportedPath : entry.path,
                sizeBytes: entry.sizeBytes,
                download: {
                  captureId: download.captureId,
                  startedAt: download.startedAt,
                  endedAt: download.endedAt,
                  url: download.url,
                },
              },
            ]
          : [];
      })
      .sort((a, b) => b.download.endedAt - a.download.endedAt)
      .slice(0, 200);
  }
  record(owner: string, fileId: string, origin: LocalOrigin): Promise<void> {
    const task = this.tail.then(async () => {
      const key = ownerKey(owner);
      const records = { ...this.owners[key], [fileId]: { ...origin } };
      const owners = { ...this.owners, [key]: records };
      await atomicJson(this.path, { version: 1, owners });
      this.owners = owners;
    });
    this.tail = task.catch(() => {});
    return task;
  }
}
