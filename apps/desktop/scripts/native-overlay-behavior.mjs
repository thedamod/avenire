/** Real PySide6 child behavior. Run only on an isolated display:
 * QT_QPA_PLATFORM=offscreen node apps/desktop/scripts/native-overlay-behavior.mjs /absolute/venv/bin/python
 * Offscreen verifies lifecycle/protocol, not transparency, capture, or GPU rendering.
 * For capture/render acceptance, run inside an isolated Xvfb with QT_QPA_PLATFORM=xcb.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { build } = require("esbuild");
if (!process.env.QT_QPA_PLATFORM || !["offscreen", "xcb"].includes(process.env.QT_QPA_PLATFORM))
  throw new Error(
    "Set QT_QPA_PLATFORM explicitly on an isolated display before running this script",
  );
const python = process.argv[2];
if (!python?.startsWith("/")) throw new Error("Pass an absolute Python executable path");
const temporary = await mkdtemp(join(tmpdir(), "avenire-overlay-behavior-"));
let native;
async function engineChildren() {
  const children = await readFile(`/proc/${process.pid}/task/${process.pid}/children`, "utf8");
  const commands = await Promise.all(
    children
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(async (pid) => {
        try {
          return (await readFile(`/proc/${pid}/cmdline`, "utf8")).includes(
            resolve("apps/desktop-native/main.py"),
          )
            ? pid
            : null;
        } catch {
          return null;
        }
      }),
  );
  return commands.filter(Boolean);
}
async function assertNoEngineChildren() {
  for (let attempt = 0; attempt < 30; attempt++) {
    // eslint-disable-next-line no-await-in-loop -- Observe actual child exit before sampling again.
    if ((await engineChildren()).length === 0) return;
    // eslint-disable-next-line no-await-in-loop -- The next observation depends on the prior interval.
    await new Promise((done) => setTimeout(done, 50));
  }
  assert.deepEqual(await engineChildren(), [], "sidecar process must exit after disposal");
}
try {
  const entry = resolve("apps/desktop/src/native-overlay.ts");
  const bundle = join(temporary, "native-overlay.mjs");
  await build({
    entryPoints: [entry],
    outfile: bundle,
    bundle: true,
    nodePaths: require.resolve.paths("effect") ?? [],
    platform: "node",
    format: "esm",
  });
  const { NativeOverlay } = await import(pathToFileURL(bundle).href);
  const config = { enabled: true, python, script: resolve("apps/desktop-native/main.py") };
  native = new NativeOverlay(config);
  const initial = await native.request("inspect");
  assert.equal(initial.visible, false);
  await Promise.all([
    native.request("show"),
    native.request("set_state", { phase: "thinking", reducedMotion: true }),
  ]);
  // Bind the real AI tool, then deliver its declarative result to the real native process.
  const toolBundle = join(temporary, "native-tool.mjs");
  await build({
    entryPoints: [resolve("packages/ai/src/tools/native-overlay-specs.ts")],
    outfile: toolBundle,
    bundle: true,
    platform: "node",
    format: "esm",
  });
  const { createNativeAnnotationTool, createNativeVisualizationTool } = await import(
    pathToFileURL(toolBundle).href
  );
  const capturedAt = "2026-11-05T00:00:00.000Z";
  const annotate = createNativeAnnotationTool(capturedAt);
  const directive = await annotate.execute(
    {
      items: [{ id: "region", kind: "rect", x: 0.1, y: 0.1, width: 0.2, height: 0.2 }],
    },
    { toolCallId: "behavioral-native-annotation", messages: [] },
  );
  assert.equal(directive.requested, true);
  assert.equal(directive.capturedAt, capturedAt);
  await native.request("annotate", { items: directive.items });
  let state = await native.request("inspect");
  assert.equal((await engineChildren()).length, 1, "concurrent startup must use one Qt process");
  assert.equal(state.visible, true);
  assert.equal(state.phase, "thinking");
  assert.equal(state.reducedMotion, true);
  assert.equal(state.items.length, 1);
  const scene = JSON.parse(await readFile("apps/desktop-native/tests/molecule-scene.json", "utf8"));
  const spatial = await createNativeVisualizationTool(capturedAt).execute(
    { scene, interactive: false },
    { toolCallId: "behavioral-spatial-explanation", messages: [] },
  );
  assert.equal(spatial.capturedAt, capturedAt);
  await native.request("visualize", {
    visible: true,
    interactive: spatial.interactive,
    scene: spatial.scene,
  });
  state = await native.request("inspect");
  assert.equal(state.visualizationVisible, true);
  assert.equal(state.sceneTitle, scene.title);
  assert.equal(state.visualizationInteractive, false);
  try {
    const capture = await native.capture();
    assert.equal(capture.mimeType, "image/png");
    assert.ok(capture.data.startsWith("iVBORw0KGgo"));
  } catch (error) {
    if (process.env.QT_QPA_PLATFORM === "xcb" || !/capture unavailable/i.test(String(error)))
      throw error;
  }
  await native.request("clear");
  await native.request("visualize", { visible: false });
  await native.request("set_state", { phase: "idle" });
  await native.request("hide");
  state = await native.request("inspect");
  assert.equal(state.visible, false);
  assert.equal(state.visualizationVisible, false);
  assert.equal(state.items.length, 0);
  await assert.rejects(
    native.request("annotate", { items: [{ id: "invalid", kind: "rect", x: -1, y: 0 }] }),
  );
  native.dispose();
  await assertNoEngineChildren();
  await assert.rejects(native.request("show"), /closed/);
  // Cancel immediately during startup; a late inspect cannot resurrect the process.
  native = new NativeOverlay(config);
  const cancelled = native.request("show");
  native.dispose();
  await assert.rejects(cancelled, /closed/);
  await assertNoEngineChildren();
  native = new NativeOverlay(config);
  await native.request("inspect");
  const [crashPid] = await engineChildren();
  const crashed = native.capture();
  await new Promise((done) => setImmediate(done));
  process.kill(Number(crashPid), "SIGKILL");
  await assert.rejects(crashed, /exited|input closed/);
  await assertNoEngineChildren();
  await assert.rejects(native.request("show"), /closed/);

  native = new NativeOverlay(config);
  await native.request("inspect");
  const [stalledPid] = await engineChildren();
  process.kill(Number(stalledPid), "SIGSTOP");
  await assert.rejects(native.request("inspect"), /timed out/);
  await assertNoEngineChildren();

  console.log(
    "PASS: real Qt child protocol, concurrent startup, state, annotations, visualization, cleanup, startup cancellation, crash and timeout",
  );
} finally {
  native?.dispose();
  await rm(temporary, { recursive: true, force: true });
}
