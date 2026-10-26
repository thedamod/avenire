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
export interface LocalOrigin {
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
