import * as Esbuild from "esbuild";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { watch } from "node:fs";

const appUrl = new URL(
  Effect.runSync(
    Config.String("AVENIRE_APP_URL").pipe(Config.withDefault("http://localhost:3000")),
  ),
);
if (
  !/^https?:$/.test(appUrl.protocol) ||
  appUrl.username ||
  appUrl.password ||
  appUrl.pathname !== "/" ||
  appUrl.search ||
  appUrl.hash
)
  throw new Error("AVENIRE_APP_URL must be an HTTP(S) origin without credentials.");
const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const extensionId = [
  ...createHash("sha256").update(Buffer.from(manifest.key, "base64")).digest().subarray(0, 16),
]
  .map((byte) => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15)))
  .join("");
if (extensionId !== "gdegpabcfhonkcnecpgaekplbfmopace")
  throw new Error(`Unexpected extension ID: ${extensionId}`);
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await Promise.all([
  cp("manifest.json", "dist/manifest.json"),
  cp("public/icons", "dist/icons", { recursive: true }),
  cp("src/popup.html", "dist/popup.html"),
  cp("src/popup.css", "dist/popup.css"),
]);
const shared = {
  bundle: true,
  platform: "browser",
  target: "chrome120",
  sourcemap: "external",
  minify: true,
  define: { __AVENIRE_APP_URL__: JSON.stringify(appUrl.origin) },
};
const builds = [
  { ...shared, entryPoints: ["src/background.ts"], outfile: "dist/background.js", format: "esm" },
  { ...shared, entryPoints: ["src/content.ts"], outfile: "dist/content.js", format: "iife" },
  { ...shared, entryPoints: ["src/popup.ts"], outfile: "dist/popup.js", format: "esm" },
];
if (process.argv.includes("--watch")) {
  const contexts = await Promise.all(builds.map((options) => Esbuild.context(options)));
  await Promise.all(contexts.map((context) => context.watch()));
  for (const [source, target] of [
    ["manifest.json", "dist/manifest.json"],
    ["src/popup.html", "dist/popup.html"],
    ["src/popup.css", "dist/popup.css"],
    ["public/icons", "dist/icons"],
  ])
    watch(source, { recursive: source === "public/icons" }, () => {
      void cp(source, target, { recursive: true }).catch((error) =>
        console.error(`Could not copy ${source}:`, error),
      );
    });
  console.log(`Watching extension bundles. App: ${appUrl.origin}; ID: ${extensionId}`);
} else {
  await Promise.all(builds.map((options) => Esbuild.build(options)));
  console.log(`Built extension. App: ${appUrl.origin}; ID: ${extensionId}`);
}
