import { build } from "vite-plus";
import { createHash } from "node:crypto";
import { copyFile, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dir = fileURLToPath(new URL("../dist/kits/", import.meta.url));
for (const [index, name] of ["math", "iso", "iso-gl"].entries()) {
  await build({
    configFile: false,
    root,
    build: {
      outDir: "dist/kits",
      emptyOutDir: index === 0,
      minify: "oxc",
      lib: { entry: `src/${name}.ts`, formats: ["es"], fileName: () => `${name}.js` },
      rollupOptions: {
        output: {
          banner:
            "/*! Includes MIT licensed pmndrs/math by Isaac Mason and anatomy by Ryan; see LICENSES.txt. */",
        },
      },
    },
  });
}
await copyFile(
  fileURLToPath(new URL("../src/vendor/anatomy/iso.css", import.meta.url)),
  `${dir}iso.css`,
);
const mathLicense = await readFile(
  fileURLToPath(new URL("../src/vendor/pmndrs-math/LICENSE", import.meta.url)),
  "utf8",
);
const anatomyLicense = await readFile(
  fileURLToPath(new URL("../src/vendor/anatomy/LICENSE", import.meta.url)),
  "utf8",
);
await writeFile(
  `${dir}LICENSES.txt`,
  `pmndrs/math (Isaac Mason)\n${mathLicense}\n\nAnatomy (Ryan / wheresryan22)\n${anatomyLicense}`,
);
const files = (await readdir(dir)).filter((name) => name !== "manifest.json").sort();
const manifest = {};
for (const name of files) {
  const bytes = await readFile(`${dir}${name}`);
  manifest[name] = {
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
await writeFile(`${dir}manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(manifest);
