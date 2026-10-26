import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

export interface InstallIdentity {
  readonly deviceId: string;
  readonly deviceName: string;
}

/** No machine identifiers: reinstalling without userData creates a new identity. */
export function loadInstallIdentity(userData: string): InstallIdentity {
  const path = join(userData, "capture-install.json");
  let deviceId: string;
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    if (typeof value.deviceId !== "string" || !/^[a-f0-9]{32}$/.test(value.deviceId))
      throw new Error("Invalid install identity");
    deviceId = value.deviceId;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
    mkdirSync(userData, { recursive: true, mode: 0o700 });
    deviceId = randomBytes(16).toString("hex");
    const temporary = `${path}.${randomBytes(6).toString("hex")}.tmp`;
    writeFileSync(temporary, JSON.stringify({ deviceId }), { mode: 0o600, flag: "wx" });
    renameSync(temporary, path);
  }
  return { deviceId, deviceName: hostname() };
}
