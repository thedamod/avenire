import { fileURLToPath } from "node:url";
import { dirname, resolve, sep } from "node:path";

/** Absolute filesystem path to the build output served at /kits/*. */
// This is a filesystem directory, not a URL asset for a bundler to import.
export const kitsDir = `${resolve(dirname(fileURLToPath(import.meta.url)), "../dist/kits")}${sep}`;
