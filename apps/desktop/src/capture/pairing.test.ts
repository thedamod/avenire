import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { PairingAuthority } from "./pairing.ts";
const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function authority() {
  const directory = await mkdtemp(join(tmpdir(), "capture-pairing-test-"));
  directories.push(directory);
  const path = join(directory, "pairings.json");
  const pairing = new PairingAuthority(path);
  await pairing.load();
  pairing.setOwner("alice");
  return { pairing, path };
}

it("requires the current owner's fetched token and clears it on owner changes", async () => {
  const { pairing } = await authority();
  const token = "A".repeat(43);
  expect(await pairing.authenticate({ _tag: "Token", token })).toBeUndefined();
  pairing.setToken("bob", token);
  expect(await pairing.authenticate({ _tag: "Token", token })).toBeUndefined();
  pairing.setToken("alice", token);
  expect(await pairing.authenticate({ _tag: "Token", token })).toEqual({});
  pairing.setOwner("bob");
  expect(await pairing.authenticate({ _tag: "Token", token })).toBeUndefined();
});

it("consumes a crypto-random code once and persists only an owner-bound secret hash", async () => {
  const { pairing, path } = await authority();
  const code = pairing.issueCode();
  expect(code).toMatch(/^\d{6}$/);
  const results = await Promise.all([
    pairing.authenticate({ _tag: "Code", code }),
    pairing.authenticate({ _tag: "Code", code }),
  ]);
  expect(results.filter(Boolean)).toHaveLength(1);
  const secret = results[0]!.secret!;
  expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(await readFile(path, "utf8")).not.toContain(secret);
  const restored = new PairingAuthority(path);
  await restored.load();
  restored.setOwner("alice");
  expect(await restored.authenticate({ _tag: "Secret", secret })).toEqual({});
  restored.setOwner("bob");
  expect(await restored.authenticate({ _tag: "Secret", secret })).toBeUndefined();
});

it("expires codes after ten minutes and invalidates them on owner changes or sign-out", async () => {
  const { pairing } = await authority();
  const code = pairing.issueCode();
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now + 600_001);
  expect(await pairing.authenticate({ _tag: "Code", code })).toBeUndefined();
  vi.restoreAllMocks();
  const second = pairing.issueCode();
  pairing.setOwner("bob");
  expect(await pairing.authenticate({ _tag: "Code", code: second })).toBeUndefined();
  pairing.setOwner(undefined);
  expect(() => pairing.issueCode()).toThrow("Sign in");
});

it("ignores a pairing-token response that completes after the owner changes, including switching back", async () => {
  const { pairing } = await authority();
  let resolve!: (response: Response) => void;
  const session = Promise.resolve(
    async () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  const pending = pairing.refreshToken("alice", "install", "https://app.test", session);
  await Promise.resolve();
  pairing.setOwner("bob");
  pairing.setOwner("alice");
  resolve(Response.json({ token: "A".repeat(43) }));
  await pending;
  expect(await pairing.authenticate({ _tag: "Token", token: "A".repeat(43) })).toBeUndefined();
});
