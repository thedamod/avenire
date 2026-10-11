import { fileURLToPath } from "node:url";

/** Absolute filesystem path to the build output served at /kits/*. */
export const kitsDir = fileURLToPath(new URL("../dist/kits/", import.meta.url));
