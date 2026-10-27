import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vite-plus/test";
import { browserDownloadRoots } from "./browser-download-roots.ts";

it("accepts configured browser download locations only from local profile preferences", async () => {
  const home = await mkdtemp(join(tmpdir(), "browser-roots-"));
  const profile = join(home, "AppData", "Local", "Google", "Chrome", "User Data", "Default");
  try {
    await mkdir(profile, { recursive: true });
    await writeFile(
      join(profile, "Preferences"),
      JSON.stringify({
        download: { default_directory: "D:\\Study downloads" },
        account_info: [{ private: "not returned" }],
      }),
    );
    expect(await browserDownloadRoots("chrome", "/Downloads", home, "win32")).toEqual([
      "/Downloads",
      "D:\\Study downloads",
    ]);
    expect(await browserDownloadRoots("edge", "/Downloads", home, "win32")).toEqual(["/Downloads"]);
    await writeFile(
      join(profile, "Preferences"),
      JSON.stringify({ download: { default_directory: "../outside" } }),
    );
    expect(await browserDownloadRoots("chrome", "/Downloads", home, "win32")).toEqual([
      "/Downloads",
    ]);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
