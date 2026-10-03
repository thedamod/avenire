import * as Esbuild from "esbuild";

const shared = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  sourcemap: true,
  external: ["electron"],
};

await Promise.all([
  Esbuild.build({ ...shared, entryPoints: ["src/main.ts"], outfile: "dist/main.cjs" }),
  Esbuild.build({ ...shared, entryPoints: ["src/preload.ts"], outfile: "dist/preload.cjs" }),
]);
