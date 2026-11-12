import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { blockedCategory } from "@avenire/capture/policy";

type Bounds = { x: number; y: number; width: number; height: number };
const run = promisify(execFile);

/** Full-display capture needs a complete compositor inventory, not foreground metadata.
 * The legacy collectors omit browsers and silently return partial lists. Until other
 * platforms have an authoritative adapter, they fail closed. Hyprland bounds are not
 * atomically tied to grim frames, so protected sources block the whole capture instead
 * of trusting a potentially stale masking rectangle.
 */
export function verifyScreenInventory(clients: unknown, monitors: unknown, area: Bounds): string {
  if (!Array.isArray(clients) || !Array.isArray(monitors) || clients.length > 4096)
    throw new Error("Screen privacy inventory unavailable");
  const matches = monitors.filter(
    (m) =>
      m &&
      m.x === area.x &&
      m.y === area.y &&
      Number.isFinite(m.scale) &&
      m.scale > 0 &&
      m.transform === 0 &&
      Math.abs(m.width / m.scale - area.width) <= 1 &&
      Math.abs(m.height / m.scale - area.height) <= 1,
  );
  if (matches.length !== 1 || typeof matches[0].name !== "string")
    throw new Error("Screen privacy display mapping is ambiguous");
  for (const c of clients) {
    if (
      !c ||
      typeof c.class !== "string" ||
      !c.class ||
      typeof c.title !== "string" ||
      typeof c.address !== "string" ||
      typeof c.mapped !== "boolean"
    )
      throw new Error("Screen privacy inventory incomplete");
    // Browser window titles cannot prove the URL/private state of all visible content.
    if (
      blockedCategory(undefined, c.class, c.title) ||
      /chrome|chromium|firefox|brave|vivaldi|opera|browser|msedge|safari/i.test(c.class)
    )
      throw new Error("Screen capture blocked by sensitive or unverifiable source");
  }
  return JSON.stringify({ clients, monitors });
}

export async function screenPrivacySnapshot(area: Bounds, supported: boolean): Promise<string> {
  if (!supported) throw new Error("Screen privacy verification is unavailable on this desktop");
  try {
    const [clients, monitors] = await Promise.all([
      run("hyprctl", ["-j", "clients"], { timeout: 1500, maxBuffer: 2 * 1024 * 1024 }),
      run("hyprctl", ["-j", "monitors"], { timeout: 1500, maxBuffer: 256 * 1024 }),
    ]);
    verifyScreenInventory(JSON.parse(clients.stdout), JSON.parse(monitors.stdout), area);
    // Hyprctl clients excludes layer-shell surfaces and is not atomic with grim.
    // Even identical inventories around capture cannot prove pixel provenance.
    // Keep capture unavailable until a compositor/portal adapter supplies that guarantee.
    throw new Error("Atomic full-display privacy coverage is unavailable");
  } catch {
    // Never disclose titles, command output or compositor errors to the renderer.
    throw new Error("Screen capture blocked: privacy coverage could not be verified");
  }
}
