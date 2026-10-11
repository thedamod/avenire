import { expect, it } from "@effect/vitest";
import { makeGateway } from "../cloud/gateway.ts";
import { readFile } from "node:fs/promises";
import * as Effect from "effect/Effect";

const readExtension = Effect.promise(() =>
  readFile(new URL("../../pi/avenire-extension.ts", import.meta.url), "utf8"),
);

it.effect(
  "ships a static Pi extension with only manifest/tools endpoints and no hosts or secrets",
  () =>
    Effect.gen(function* () {
      const source = yield* readExtension;
      const endpoints = source.match(/\/api\/ruth-cloud\/[\w/]+/g);
      expect(endpoints).toEqual(["/api/ruth-cloud/manifest", "/api/ruth-cloud/tools/"]);
      expect(source).toContain("export default async function");
      expect(source).toContain("Type.Unsafe(tool.inputSchema)");
      expect(source).toContain("AbortSignal.any");
      expect(source).toContain("10 * 60_000");
      expect(source).not.toMatch(/https?:\/\//);
      expect(source).not.toMatch(/sk-ant-|sk-proj-|Bearer\s+[A-Za-z0-9_-]{20,}/);
      expect(source).toContain("process.env.AVENIRE_RUN_TOKEN");
      expect(source).not.toContain("ANTHROPIC_API_KEY");
    }),
);

it.effect("reads exactly the manifest fields the gateway serves", () =>
  Effect.gen(function* () {
    const source = yield* readExtension;
    const manifest = makeGateway().toolManifest();
    expect(manifest.length).toBeGreaterThan(0);
    for (const entry of manifest) {
      // The extension rejects the whole manifest if any of these keys is missing.
      expect(Object.keys(entry).sort()).toEqual(["description", "inputSchema", "name"]);
      expect(entry.inputSchema).toBeTypeOf("object");
    }
    for (const key of ["entry.name", "entry.description", "entry.inputSchema"])
      expect(source).toContain(key);
  }),
);
