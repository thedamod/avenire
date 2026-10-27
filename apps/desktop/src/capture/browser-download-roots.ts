import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { BrowserKind } from "@avenire/contracts";
import { normalizeCapturePath } from "./local-file.ts";

/** Read only download.default_directory from local Chromium preferences, never peer-supplied roots. */
export async function browserDownloadRoots(
  browser: BrowserKind,
  defaultRoot: string,
  home = homedir(),
  platform: NodeJS.Platform = process.platform,
): Promise<string[]> {
  const names: Partial<Record<BrowserKind, readonly [string, string, string]>> = {
    chrome: ["Google/Chrome/User Data", "Google/Chrome", "google-chrome"],
    edge: ["Microsoft/Edge/User Data", "Microsoft Edge", "microsoft-edge"],
    brave: [
      "BraveSoftware/Brave-Browser/User Data",
      "BraveSoftware/Brave-Browser",
      "BraveSoftware/Brave-Browser",
    ],
    vivaldi: ["Vivaldi/User Data", "Vivaldi", "vivaldi"],
    arc: ["TheBrowserCompany/Arc/User Data", "Arc/User Data", "arc"],
  };
  const roots = new Set([defaultRoot]);
  const name = names[browser];
  let userData: string | undefined;
  if (name)
    userData =
      platform === "win32"
        ? join(home, "AppData", "Local", name[0])
        : platform === "darwin"
          ? join(home, "Library", "Application Support", name[1])
          : join(home, ".config", name[2]);
  if (browser === "opera")
    userData =
      platform === "win32"
        ? join(home, "AppData", "Roaming", "Opera Software", "Opera Stable")
        : platform === "darwin"
          ? join(home, "Library", "Application Support", "com.operasoftware.Opera")
          : join(home, ".config", "opera");
  if (!userData) return [...roots];
  try {
    const entries = await readdir(userData, { withFileTypes: true });
    const profiles = [
      userData,
      ...entries
        .filter((entry) => entry.isDirectory() && /^(Default|Profile \d+)$/.test(entry.name))
        .slice(0, 20)
        .map((entry) => join(userData!, entry.name)),
    ];
    await Promise.all(
      profiles.map(async (profile) => {
        try {
          const path = join(profile, "Preferences");
          if ((await stat(path)).size > 8 * 1024 * 1024) return;
          const prefs = JSON.parse(
            await readFile(path, { encoding: "utf8", signal: AbortSignal.timeout(500) }),
          );
          const raw: unknown = prefs?.download?.default_directory;
          const directory = typeof raw === "string" ? normalizeCapturePath(raw) : undefined;
          if (directory) roots.add(directory);
        } catch {
          /* Missing, locked or malformed profile preferences leave the OS default available. */
        }
      }),
    );
  } catch {
    /* Browser may have no conventional on-disk profile. */
  }
  return [...roots];
}
