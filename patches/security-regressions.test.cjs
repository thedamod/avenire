"use strict";

// These probes resolve the live pnpm dependency graph, including patch hashes.
// Run with the workspace's pnpm dependency-verification override; no provider calls.
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { generateKeyPairSync } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const graph = JSON.parse(
  execFileSync(
    "pnpm",
    [
      "why",
      "--recursive",
      "--json",
      "braces",
      "node-forge",
      "sprintf-js",
      "uuid",
      "effect",
      "esbuild",
      "http-cache-semantics",
      "xcode",
      "better-auth",
      "@better-auth/expo",
    ],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, pnpm_config_verify_deps_before_run: "false" },
    },
  ),
);

const entries = (name) => {
  const matches = graph.filter((entry) => entry.name === name);
  assert.ok(matches.length > 0, `${name} must be present in the resolved graph`);
  return matches;
};
const load = (entry) => require(entry.path);

// GHSA-vfj7-8cjw-p6xm: deeply nested strings and caller-built ASTs must
// stop before reaching the JavaScript stack limit in all recursive walkers.
test("braces rejects excessive nesting and preserves normal expansion", () => {
  for (const entry of entries("braces")) {
    const braces = load(entry);
    assert.deepEqual(braces.expand("src/{api,worker}/*.ts"), ["src/api/*.ts", "src/worker/*.ts"]);
    for (const [open, close] of [
      ["{", "}"],
      ["(", ")"],
    ]) {
      assert.throws(() => braces(`${open.repeat(4000)}a,b${close.repeat(4000)}`), {
        name: "SyntaxError",
        message: /maximum nesting depth/,
      });
    }
    let node = { type: "text", value: "file" };
    for (let index = 0; index < 6000; index++) {
      const parent = { type: "brace", nodes: [node], commas: 0, ranges: 0 };
      node.parent = parent;
      node = parent;
    }
    node.type = "root";
    for (const method of ["compile", "expand", "stringify"]) {
      assert.throws(() => braces[method](node), {
        name: "SyntaxError",
        message: /maximum nesting depth/,
      });
    }
  }
});

// CVE-2026-85393; source backport: https://github.com/digitalbazaar/forge/pull/1152
// A correctly signed malformed DigestInfo isolates the nested count check.
test("forge rejects extra nested DigestAlgorithm children", () => {
  const { privateKey: pem } = generateKeyPairSync("rsa", {
    modulusLength: 1024,
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
    publicKeyEncoding: { type: "pkcs1", format: "pem" },
  });
  for (const entry of entries("node-forge")) {
    const forge = load(entry);
    const privateKey = forge.pki.privateKeyFromPem(pem);
    const publicKey = forge.pki.rsa.setPublicKey(privateKey.n, privateKey.e);
    const md = forge.md.sha256.create().update("avenire dependency regression");
    const digest = md.digest().getBytes();
    assert.equal(publicKey.verify(digest, privateKey.sign(md)), true);
    const { asn1 } = forge;
    const create = (type, constructed, value) =>
      asn1.create(asn1.Class.UNIVERSAL, type, constructed, value);
    for (const withNull of [true, false]) {
      const algorithm = [
        create(asn1.Type.OID, false, asn1.oidToDer(forge.pki.oids.sha256).getBytes()),
      ];
      if (withNull) algorithm.push(create(asn1.Type.NULL, false, ""));
      algorithm.push(create(asn1.Type.OCTETSTRING, false, "unconsumed garbage"));
      const malformed = asn1
        .toDer(
          create(asn1.Type.SEQUENCE, true, [
            create(asn1.Type.SEQUENCE, true, algorithm),
            create(asn1.Type.OCTETSTRING, false, digest),
          ]),
        )
        .getBytes();
      const signature = privateKey.sign(malformed, null);
      assert.throws(() => publicKey.verify(digest, signature), /DigestInfo/);
    }
  }
});

// GHSA-hp3w-g68c-fv3c: numeric formatting must cap untrusted precision
// before invoking Number.toFixed/toExponential/toPrecision.
test("sprintf bounds precision and padding while preserving ordinary formats", () => {
  for (const entry of entries("sprintf-js")) {
    const { sprintf } = load(entry);
    assert.equal(sprintf("%.2f %s", 1.234, "ok"), "1.23 ok");
    for (const type of ["f", "e", "g"]) {
      const result = sprintf(`%.9999999999999999999999999${type}`, 1.25);
      assert.equal(typeof result, "string");
      assert.ok(result.length <= 110);
    }
    assert.equal(sprintf("%9999999999999999999999999s", "x").length, 1048576);
  }
});

test("Better Auth and its Expo integration resolve to 1.7.10", () => {
  for (const name of ["better-auth", "@better-auth/expo"]) {
    for (const { version } of entries(name)) assert.equal(version, "1.7.10");
  }
});

test("resolved graph removes vulnerable Effect, esbuild, uuid and cache versions", () => {
  assert.doesNotMatch(readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8"), /effect@3\.17\.7/);
  assert.equal(
    entries("effect").some(({ version }) => version === "3.17.7"),
    false,
  );
  assert.ok(entries("effect").some(({ version }) => version === "4.0.0"));
  for (const { version } of entries("effect")) {
    if (version.startsWith("3.")) assert.ok(Number(version.split(".")[1]) >= 20);
  }
  for (const { version } of entries("esbuild")) {
    const [, minor, patch] = version.split(".").map(Number);
    assert.ok(minor > 24 || (minor === 24 && patch >= 3), version);
    assert.ok(minor !== 27 || patch < 3, version);
    assert.ok(minor !== 28 || patch >= 1, version);
  }
  for (const entry of entries("esbuild")) {
    assert.match(
      load(entry).transformSync("const n: number = 1", { loader: "ts" }).code,
      /const n = 1/,
    );
  }
  // xcode 4 uses node:crypto and no longer installs uuid. Check every installed
  // copy when present; the xcode UUID-generation probe below still runs either way.
  for (const entry of graph.filter((entry) => entry.name === "uuid")) {
    const [major, minor, patch] = entry.version.split(".").map(Number);
    assert.ok(major > 11 || (major === 11 && (minor > 1 || (minor === 1 && patch >= 1))));
    assert.match(load(entry).v4(), /^[\da-f-]{36}$/);
  }
  for (const entry of entries("xcode")) {
    const project = load(entry).project("/tmp/avenire-unused.pbxproj");
    project.hash = { project: { objects: {} } };
    assert.match(project.generateUuid(), /^[\dA-F]{24}$/);
  }
  for (const { version } of entries("http-cache-semantics")) {
    const [major, minor] = version.split(".").map(Number);
    assert.ok(major > 4 || (major === 4 && minor >= 3));
  }
});

test("security restrictions survive max-stale and stale extensions", () => {
  for (const entry of entries("http-cache-semantics")) {
    const CachePolicy = load(entry);
    const request = { url: "https://example.invalid/account", method: "GET", headers: {} };
    const nextRequest = {
      ...request,
      headers: { "cache-control": "max-stale=999999999" },
    };
    const extensions = ", stale-if-error=999999999, stale-while-revalidate=999999999";
    for (const headers of [
      { "cache-control": "private, max-age=0" },
      { "cache-control": "no-store, max-age=0" },
      { "cache-control": "no-cache, max-age=0" },
      { "cache-control": "max-age=0", "set-cookie": "session=user-a" },
      { "cache-control": "proxy-revalidate, max-age=0" },
      { "cache-control": "must-revalidate, max-age=0" },
      { "cache-control": "public, max-age=0", vary: "Accept, *" },
    ]) {
      const policy = new CachePolicy(
        request,
        {
          status: 200,
          headers: { ...headers, "cache-control": headers["cache-control"] + extensions },
        },
        { shared: true },
      );
      assert.equal(
        policy.satisfiesWithoutRevalidation(nextRequest),
        false,
        JSON.stringify(headers),
      );
      assert.equal(policy.evaluateRequest(nextRequest).response, undefined);
      const restored = CachePolicy.fromObject(policy.toObject());
      assert.equal(restored.satisfiesWithoutRevalidation(nextRequest), false);
      assert.equal(policy.useStaleWhileRevalidate(), false);
      assert.equal(
        policy.revalidatedPolicy(nextRequest, { status: 503, headers: {} }).matches,
        false,
      );
    }
    // Expired public responses may still honor a client's explicit max-stale.
    const publicPolicy = new CachePolicy(request, {
      status: 200,
      headers: { "cache-control": "public, max-age=0" },
    });
    assert.equal(publicPolicy.satisfiesWithoutRevalidation(nextRequest), true);
    const privatePolicy = new CachePolicy(
      request,
      {
        status: 200,
        headers: { "cache-control": "private, max-age=600" },
      },
      { shared: false },
    );
    assert.equal(privatePolicy.satisfiesWithoutRevalidation(nextRequest), true);
  }
});

test("files-sdk retains a constructible UploadThing provider with the patched Effect peer", async () => {
  const providerPath = path.join(
    root,
    "packages/storage/node_modules/files-sdk/dist/uploadthing/index.js",
  );
  const { uploadthing } = await import(pathToFileURL(providerPath).href);
  const requireFromProvider = createRequire(providerPath);
  const requireFromUploadThing = createRequire(requireFromProvider.resolve("uploadthing/server"));
  assert.equal(requireFromUploadThing("effect/package.json").version, "3.22.3");
  const requireFromStorage = createRequire(path.join(root, "packages/storage/package.json"));
  assert.equal(requireFromStorage("effect/package.json").version, "4.0.0");
  const token = Buffer.from(
    JSON.stringify({
      apiKey: "sk_test_no_provider_calls",
      appId: "avenire-test",
      regions: ["sea1"],
    }),
  ).toString("base64");
  const adapter = uploadthing({ token, acl: "private" });
  for (const method of ["upload", "download", "head", "list", "delete", "url"]) {
    assert.equal(typeof adapter[method], "function", method);
  }
});
