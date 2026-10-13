import { build } from "vite-plus";
import { createHash } from "node:crypto";
import { copyFile, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dir = fileURLToPath(new URL("../dist/kits/", import.meta.url));
const entries = { math: "src/math/index.ts", iso: "src/iso/index.ts", "iso-gl": "src/iso/gl.ts" };
for (const [index, [name, entry]] of Object.entries(entries).entries()) {
  await build({
    configFile: false,
    root,
    build: {
      outDir: "dist/kits",
      emptyOutDir: index === 0,
      minify: "oxc",
      lib: { entry, formats: ["es"], fileName: () => `${name}.js` },
      rollupOptions: {
        output: {
          banner:
            "/*! Includes MIT licensed pmndrs/math by Isaac Mason and isometric geometry by Ryan; see LICENSES.txt. */",
        },
      },
    },
  });
}
await copyFile(fileURLToPath(new URL("../src/iso/iso.css", import.meta.url)), `${dir}iso.css`);
const mathLicense = await readFile(
  fileURLToPath(new URL("../src/math/LICENSE", import.meta.url)),
  "utf8",
);
const isoLicense = await readFile(
  fileURLToPath(new URL("../src/iso/LICENSE", import.meta.url)),
  "utf8",
);
await writeFile(
  `${dir}LICENSES.txt`,
  `pmndrs/math (Isaac Mason)\n${mathLicense}\n\nIsometric geometry (Ryan / wheresryan22)\n${isoLicense}`,
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
