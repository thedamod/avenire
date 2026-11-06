/** Real compiled Qt process and deliberately broken native-process E2E checks.
 * Always offscreen: this is lifecycle/protocol/deployment proof, not visual proof.
 * Run from any cwd. Optional positional argument: absolute staged executable.
 * Custom build directory: --fixture /absolute/build/overlay-protocol-fixture(.exe).
 */
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { syncBuiltinESMExports, createRequire } from "node:module";
import { mkdtemp, rm, readFile, cp, stat, readdir, realpath, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { parseArgs } from "node:util";
import { resolve, join, dirname, basename, isAbsolute } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { build } = require("esbuild");
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const filename = process.platform === "win32" ? "avenire-overlay.exe" : "avenire-overlay";
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { fixture: { type: "string" } },
});
const executable = positionals[0] ?? join(desktop, "native-dist", filename);
assert.ok(isAbsolute(executable), "Pass an absolute native executable path");
const source = dirname(executable);
const manifest = JSON.parse(await readFile(join(source, "deployment.json"), "utf8"));
assert.equal(manifest.qt, "6.8.3");
assert.equal(manifest.platform, process.platform);
assert.equal(manifest.arch, process.arch);
const temporary = await mkdtemp(join(tmpdir(), "avenire-overlay-behavior-"));
const deployed = join(temporary, "relocated deployment");
// Track actual ChildProcess exit events portably; no /proc or platform signal assumptions.
const spawn = childProcess.spawn;
const children = [];
childProcess.spawn = (...args) => {
  const child = spawn(...args);
  const done = new Promise((resolve) => {
    child.once("close", resolve);
    child.once("error", resolve);
  });
  const entry = { child, done, stderr: "" };
  child.stderr?.on("data", (chunk) => {
    entry.stderr = (entry.stderr + chunk.toString("utf8")).slice(-8192);
  });
  children.push(entry);
  return child;
};
syncBuiltinESMExports();
let native;
let phase = "deployment validation";
async function exited(child) {
  await Promise.race([
    child.done,
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error("Companion did not exit")), 2500);
      timer.unref();
    }),
  ]);
}
try {
  await cp(source, deployed, { recursive: true, verbatimSymlinks: true });
  const notices = JSON.parse(
    await readFile(join(deployed, "licenses/Qt-6.8.3/sources.json"), "utf8"),
  );
  assert.equal(notices.length, 6, "All deployed Qt modules retain source/license provenance");
  for (const module of [
    "qtbase",
    "qtdeclarative",
    "qtquick3d",
    "qtquicktimeline",
    "qtshadertools",
    "qtsvg",
  ]) {
    assert.ok((await stat(join(deployed, "licenses/Qt-6.8.3", `${module}-NOTICES.txt`))).size > 0);
  }
  const relocated = join(deployed, filename);
  const info = await stat(relocated);
  if (process.platform !== "win32")
    assert.ok(info.mode & 0o111, "Executable permissions preserved");
  const entries = await readdir(deployed);
  assert.ok(
    entries.some((entry) => /^(lib|plugins|platforms|avenire-overlay.app)$/.test(entry)),
    "Qt deployment must accompany executable",
  );
  process.env.QT_QPA_PLATFORM = "offscreen";
  process.env.QT_QUICK_BACKEND = "software";
  delete process.env.QSG_RHI_BACKEND;
  for (const name of [
    "QT_PLUGIN_PATH",
    "QML_IMPORT_PATH",
    "QML2_IMPORT_PATH",
    "LD_LIBRARY_PATH",
    "DYLD_LIBRARY_PATH",
    "QT_QPA_PLATFORM_PLUGIN_PATH",
  ])
    delete process.env[name];
  // The executable must find its own Qt DLLs/frameworks instead of an SDK PATH.
  if (process.platform === "win32")
    process.env.PATH = `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}`;
  const bundle = join(temporary, "native-overlay.mjs");
  await build({
    entryPoints: [join(desktop, "src/native-overlay.ts")],
    outfile: bundle,
    bundle: true,
    nodePaths: require.resolve.paths("effect") ?? [],
    platform: "node",
    format: "esm",
  });
  const { NativeOverlay, loadNativeOverlayConfig } = await import(pathToFileURL(bundle).href);
  const paths = { packaged: true, resourcesPath: temporary, appPath: desktop };
  assert.equal(
    loadNativeOverlayConfig(paths).executable,
    join(temporary, "native-overlay", filename),
  );
  assert.equal(
    loadNativeOverlayConfig({ ...paths, packaged: false }).executable,
    join(desktop, "native-dist", filename),
  );
  if (process.platform === "darwin") {
    // The launcher symlink and the Mach-O inside the bundle must both work.
    // Launching only the root alias masked QML modules deployed outside .app.
    const qml = join(deployed, "avenire-overlay.app/Contents/Resources/qml");
    for (const module of ["QtQuick", "QtQuick/Window", "QtQuick/Shapes", "QtQuick3D"])
      assert.ok((await stat(join(qml, module, "qmldir"))).isFile());
    phase = "canonical macOS bundle startup";
    const direct = new NativeOverlay({ enabled: true, executable: await realpath(relocated) });
    try {
      assert.equal((await direct.request("inspect")).visible, false);
    } finally {
      direct.dispose();
      await exited(children.at(-1));
    }
  }
  phase = "relocated launcher lifecycle";
  const launcher = process.platform === "win32" ? relocated : join(deployed, "overlay-launcher");
  if (launcher !== relocated) await symlink(filename, launcher);
  const config = { enabled: true, executable: launcher };
  native = new NativeOverlay(config);
  const countBeforeStartup = children.length;
  const [initial] = await Promise.all([native.request("inspect"), native.request("inspect")]);
  assert.equal(initial.visible, false);
  assert.equal(children.length, countBeforeStartup + 1, "Concurrent startup spawns one process");
  assert.equal(
    children.at(-1).child.spawnfile,
    await realpath(launcher),
    "Launch the canonical executable so Qt recognizes its macOS bundle through aliases",
  );
  const before = children.length;
  await Promise.all([
    native.request("show"),
    native.request("set_state", { phase: "thinking", reducedMotion: true }),
  ]);
  assert.equal(children.length, before, "Concurrent requests reuse a single child");
  await native.request("annotate", {
    items: [{ id: "region", kind: "rect", x: 0.1, y: 0.1, width: 0.2, height: 0.2 }],
  });
  const scene = {
    title: "Companion deployment E2E",
    cameraDistance: 450,
    objects: [
      {
        id: "cube",
        shape: "cube",
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: "#8171ef",
      },
    ],
  };
  await native.request("visualize", { visible: true, interactive: false, scene });
  let state = await native.request("inspect");
  assert.equal(state.phase, "thinking");
  assert.equal(state.reducedMotion, true);
  assert.equal(state.items.length, 1);
  assert.equal(state.sceneTitle, scene.title);
  assert.equal(state.visualizationVisible, true);
  const pointer = await native.request("get_cursor");
  assert.ok(Number.isInteger(pointer.globalX) && Number.isInteger(pointer.globalY));
  assert.ok(typeof pointer.observedAt === "string");
  const diagram = {
    kind: "cart-pole",
    title: "Data-driven 2D geometry",
    angleDegrees: 15,
    cartPosition: 0.1,
    poleLength: 1.8,
    showForce: true,
    theme: "dark",
  };
  await native.request("visualize", { visible: true, interactive: false, diagram });
  const geometry = await native.request("inspect");
  assert.equal(geometry.visualizationMode, "cart-pole");
  assert.deepEqual(geometry.diagram, diagram);

  await assert.rejects(
    native.request("annotate", { items: [{ id: "invalid", kind: "rect", x: -1, y: 0 }] }),
  );
  await assert.rejects(
    native.request("annotate", { items: ["x".repeat(1100000)] }),
    /exceeded limit/,
  );
  await native.request("clear");
  await native.request("visualize", { visible: false });
  await native.request("hide");
  state = await native.request("inspect");
  assert.equal(state.visible, false);
  assert.equal(state.items.length, 0);
  native.dispose();
  await exited(children.at(-1));
  await assert.rejects(native.request("show"), /closed/);
  native = new NativeOverlay(config);
  const cancelled = native.request("show");
  native.dispose();
  await assert.rejects(cancelled, /closed/);
  await exited(children.at(-1));
  native = new NativeOverlay(config);
  await native.request("inspect");
  children.at(-1).child.kill("SIGKILL");
  await exited(children.at(-1));
  await assert.rejects(native.request("show"), /closed/);
  // Real host rejects malformed and unknown requests while keeping a usable stream.
  const protocol = childProcess.spawn(await realpath(relocated), [], {
    stdio: "pipe",
    windowsHide: true,
  });
  protocol.stderr.resume();
  let raw = "";
  const responses = [];
  const completed = new Promise((resolve, reject) => {
    protocol.stdout.on("data", (chunk) => {
      raw += chunk.toString("utf8");
      let end;
      while ((end = raw.indexOf("\n")) >= 0) {
        responses.push(JSON.parse(raw.slice(0, end)));
        raw = raw.slice(end + 1);
        if (responses.length === 3) resolve();
      }
    });
    protocol.once("error", reject);
    protocol.once("close", () => {
      if (responses.length !== 3) reject(new Error("Protocol child exited early"));
    });
  });
  protocol.stdin.write(
    'not-json\n{"id":7,"method":"unknown","params":{}}\n{"id":8,"method":"inspect","params":{}}\n',
  );
  const protocolDeadline = setTimeout(() => protocol.kill("SIGKILL"), 8000);
  try {
    await completed;
    assert.equal(responses[0].ok, false);
    assert.equal(responses[1].id, 7);
    assert.equal(responses[1].ok, false);
    assert.equal(responses[2].id, 8);
    assert.equal(responses[2].ok, true);
  } finally {
    clearTimeout(protocolDeadline);
    protocol.stdin.end();
  }
  await exited(children.at(-1));
  // EOF terminates the real executable, independently of adapter shutdown.
  const eof = childProcess.spawn(await realpath(relocated), [], {
    stdio: "pipe",
    windowsHide: true,
  });
  eof.stdout.resume();
  eof.stderr.resume();
  eof.stdin.end();
  await exited(children.at(-1));
  assert.equal(eof.exitCode, 0, "EOF is a clean shutdown");
  const fixture =
    values.fixture ??
    join(
      desktop,
      "build/native",
      process.platform === "win32" ? "overlay-protocol-fixture.exe" : "overlay-protocol-fixture",
    );
  assert.ok(isAbsolute(fixture), "Fixture override must be an absolute executable path");
  for (const [mode, expected] of [
    ["malformed", /protocol/],
    ["oversized", /exceeded limit/],
    ["stall", /timed out/],
  ]) {
    process.env.AVENIRE_OVERLAY_TEST_MODE = mode;
    native = new NativeOverlay({ enabled: true, executable: fixture });
    await assert.rejects(native.request("inspect"), expected);
    await exited(children.at(-1));
  }
  process.env.AVENIRE_OVERLAY_TEST_MODE = "dismiss";
  let dismissed = 0;
  native = new NativeOverlay({ enabled: true, executable: fixture }, () => dismissed++);
  await native.request("inspect");
  assert.ok(dismissed > 0, "Unsolicited dismiss event reaches the owner");
  native.dispose();
  await exited(children.at(-1));
  native = new NativeOverlay({ enabled: true, executable: join(temporary, "missing", filename) });
  await assert.rejects(native.request("inspect"), /could not start|input closed/);
  native = new NativeOverlay({ enabled: true, executable: basename(executable) });
  await assert.rejects(native.request("inspect"), /absolute executable/);
  console.log(
    "PASS: relocated Qt deployment, protocol/state/scene, disposal, cancellation, crash, EOF, malformed/oversized output, startup timeout, dismiss and missing executable",
  );
} catch (error) {
  console.error(`Native E2E failed during ${phase}`);
  console.error(error);
  for (const { child, stderr } of children) {
    if (stderr)
      console.error(`Child exit=${child.exitCode} signal=${child.signalCode}:\n${stderr}`);
  }
  throw error;
} finally {
  native?.dispose();
  for (const { child } of children)
    if (child.exitCode === null && child.signalCode === null) {
      child.ref();
      child.kill("SIGKILL");
    }
  await Promise.all(children.map(exited));
  childProcess.spawn = spawn;
  syncBuiltinESMExports();
  delete process.env.AVENIRE_OVERLAY_TEST_MODE;
  await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
