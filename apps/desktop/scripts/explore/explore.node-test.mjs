import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspect, runDesktop } from "./inspect.mjs";
import { probe } from "./probe.mjs";

const snapshot = {
  ok: true,
  command: "snapshot",
  data: {
    complete: false,
    ref_count: 1,
    window: { id: "w-test" },
    tree: { role: "window", children: [{ role: "button", name: "<Run>", ref_id: "@stest:e1" }] },
  },
};
const raw = JSON.stringify(snapshot) + "\n";
const fake = async (_binary, args) =>
  args[0] === "status"
    ? { raw: '{"ok":true,"data":{"platform":"test"}}', envelope: { ok: true, data: {} } }
    : { raw, envelope: snapshot };
const temp = () => mkdtemp(join(tmpdir(), "avenire-explore-test-"));

test("preserves exact model payload and partial coverage, requests no image by default", async () => {
  const out = join(await temp(), "capture");
  const calls = [];
  const result = await inspect({ app: "an app;$(no shell)", out }, async (...args) => {
    calls.push(args[1]);
    return fake(...args);
  });
  assert.equal(await readFile(join(out, "model-visible.json"), "utf8"), raw);
  assert.equal(result.complete, false);
  assert.equal(result.imageIncluded, false);
  assert.equal(calls.length, 2);
  assert.equal(calls[1][2], "an app;$(no shell)");
  await assert.rejects(inspect({ app: "test", out }, fake), /EEXIST/);
});

test("pins optional screenshot to resolved window, validates PNG bytes", async () => {
  const calls = [];
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
  const out = join(await temp(), "capture");
  await inspect({ app: "test", out, screenshot: true }, async (binary, args) => {
    calls.push(args);
    if (args[0] !== "screenshot") return fake(binary, args);
    return { raw: "", envelope: { data: { format: "png", data: png.toString("base64") } } };
  });
  assert.deepEqual(calls[2].slice(0, 5), ["screenshot", "--app", "test", "--window-id", "w-test"]);
  assert.equal(calls[0].at(-1), calls[2].at(-1));
  assert.deepEqual(await readFile(join(out, "window.png")), png);
});

test("records observation failure without calling screenshot", async () => {
  const out = join(await temp(), "capture");
  let calls = 0;
  await assert.rejects(
    inspect({ app: "test", out, screenshot: true }, async () => {
      calls++;
      throw new Error("permission denied");
    }),
    /permission denied/,
  );
  assert.equal(calls, 1);
  assert.equal(JSON.parse(await readFile(join(out, "failure.json"))).state, "failed");
});

test("probe requires input authorization and a ref from its capture before any delivery", async () => {
  const capture = join(await temp(), "capture");
  await inspect({ app: "test", out: capture }, fake);
  let calls = 0;
  const run = async () => {
    calls++;
    throw new Error("unexpected delivery");
  };
  await assert.rejects(
    probe({ capture, ref: "@stest:e1", mode: "cursor-hover", out: "unused" }, run),
    /allow-input/,
  );
  await assert.rejects(
    probe(
      { capture, ref: "@sother:e1", mode: "semantic-click", allowInput: true, out: "unused" },
      run,
    ),
    /belong/,
  );
  assert.equal(calls, 0);
});

test("uncertain delivery is recorded and never retried", async () => {
  const root = await temp();
  const capture = join(root, "capture");
  await inspect({ app: "test", out: capture }, fake);
  let calls = 0;
  const out = join(root, "probe");
  await assert.rejects(
    probe(
      { capture, ref: "@stest:e1", mode: "semantic-click", allowInput: true, out },
      async () => {
        calls++;
        throw new Error("delivered_unverified");
      },
    ),
    /delivered_unverified/,
  );
  assert.equal(calls, 1);
  assert.match(await readFile(join(out, "failure.json"), "utf8"), /Do not repeat/);
});

test("cursor probe explicitly enables headed input and independently reads the same window", async () => {
  const root = await temp();
  const capture = join(root, "capture");
  await inspect({ app: "test", out: capture }, fake);
  const calls = [];
  await probe(
    { capture, ref: "@stest:e1", mode: "cursor-hover", allowInput: true, out: join(root, "probe") },
    async (binary, args) => {
      calls.push(args);
      return fake(binary, args);
    },
  );
  assert.deepEqual(calls[0].slice(0, 3), ["--headed", "hover", "@stest:e1"]);
  assert.equal(calls[0].at(-1), calls[2].at(-1));
  assert.ok(calls[2].includes("w-test"));
});

test("subprocess refuses malformed JSON and nonzero exits with an ok envelope", async () => {
  const file = join(await temp(), "fake.mjs");
  await writeFile(file, 'console.log("not json")');
  await assert.rejects(runDesktop(process.execPath, [file]), /no JSON/);
  await writeFile(file, "console.log(JSON.stringify({ok:true,data:{}}));process.exitCode=1");
  await assert.rejects(runDesktop(process.execPath, [file]), /failed/);
});
