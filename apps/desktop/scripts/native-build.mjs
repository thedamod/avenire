/** Build and stage Qt with its CMake deployment API (windeployqt/macdeployqt on those OSes).
 * Usage: node scripts/native-build.mjs --qt /absolute/Qt/6.8.3/<kit> [--build /path]
 * Tools must be on PATH. No Python interpreter is involved in the application runtime.
 */
import { spawnSync } from "node:child_process";
import { cp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({
  options: {
    qt: { type: "string" },
    build: { type: "string" },
  },
});
const build = resolve(values.build ?? join(desktop, "build/native"));
const stage = join(desktop, "native-dist");
function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}
run("cmake", [
  "-S",
  join(desktop, "scripts/native"),
  "-B",
  build,
  "-G",
  "Ninja",
  "-DCMAKE_BUILD_TYPE=Release",
  `-DCMAKE_INSTALL_PREFIX=${stage}`,
  ...(values.qt ? [`-DCMAKE_PREFIX_PATH=${resolve(values.qt)}`] : []),
]);
run("cmake", [
  "--build",
  build,
  "--config",
  "Release",
  "--target",
  "avenire-overlay",
  "overlay-protocol-fixture",
  "--parallel",
  "2",
]);
// Only clear the dedicated generated staging directory after a successful build.
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
run("cmake", ["--install", build, "--config", "Release"]);
await cp(join(desktop, "resources/licenses"), join(stage, "licenses"), {
  recursive: true,
});
if (process.platform === "darwin") {
  // Retain the native bundle layout and its portable framework install names. Electron
  // resolves this alias before spawning so Qt recognizes its bundle resources.
  // The symlink and bundle must both survive extraResources.
  await rm(join(stage, "avenire-overlay"), { force: true });
  await symlink(
    "avenire-overlay.app/Contents/MacOS/avenire-overlay",
    join(stage, "avenire-overlay"),
  );
}
await writeFile(
  join(stage, "deployment.json"),
  JSON.stringify(
    {
      qt: "6.8.3",
      platform: process.platform,
      arch: process.arch,
      executable: process.platform === "win32" ? "avenire-overlay.exe" : "avenire-overlay",
      distributionLicenseBasis: "unselected",
      distributionReady: false,
      signing: "unsigned", // Signing jobs verify signatures; build never claims a signature.
    },
    null,
    2,
  ) + "\n",
);
console.log(`Native overlay staged at ${stage}`);
