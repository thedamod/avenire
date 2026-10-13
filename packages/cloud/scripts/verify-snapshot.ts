/** Real render/desktop verification. One disposable sandbox, downloaded artifacts, no secrets. */
import { Daytona, type Sandbox } from "@daytonaio/sdk";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { AVENIRE_SNAPSHOT } from "../src/snapshots.ts";
import { figure } from "./verify/figures.ts";
import { gallery, type Check, type Output } from "./verify/gallery.ts";
import { desktop, sessionEnv } from "./verify/desktop.ts";
import { widgetPages } from "./verify/widgets.ts";

const snapshot = process.env.SNAPSHOT ?? AVENIRE_SNAPSHOT;
const out = process.env.OUT_DIR ?? `/tmp/avenire-snapshot/${snapshot}`;
const renders = `${out}/renders`;
const work = "/home/daytona/work";
const results: Check[] = [];
const log = (line: string) => process.stdout.write(line + "\n");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let sandbox: Sandbox | undefined;
await mkdir(renders, { recursive: true });
// The explicitly requested build touches only ignored widget-kit dist artifacts.
execFileSync("pnpm", ["--filter", "@avenire/widget-kit", "build"], {
  cwd: fileURLToPath(new URL("../../../", import.meta.url)),
  stdio: "inherit",
});
async function download(remote: string, local: string): Promise<Output> {
  const bytes = await sandbox!.fs.downloadFile(remote);
  if (!bytes.length) throw new Error(`Empty output: ${remote}`);
  const path = `${renders}/${local}`;
  await writeFile(path, bytes);
  return { path, bytes: bytes.length };
}
async function check(
  name: string,
  command: string,
  action: () => Promise<{ detail: string; outputs?: Output[] }>,
) {
  const started = Date.now();
  const r: Check = { check: name, ok: false, seconds: 0, command, detail: "", outputs: [] };
  try {
    const value = await action();
    r.detail = value.detail;
    r.outputs = value.outputs ?? [];
    r.ok = true;
  } catch (e) {
    r.detail = e instanceof Error ? e.message : String(e);
  }
  r.seconds = (Date.now() - started) / 1000;
  results.push(r);
  log(`${r.ok ? "PASS" : "FAIL"} ${name} ${r.seconds.toFixed(2)}s: ${r.detail.slice(-700)}`);
  await writeFile(`${out}/verify.json`, JSON.stringify(results, null, 2) + "\n");
}
async function execute(command: string, timeout = 300) {
  const response = await sandbox!.process.executeCommand(command, work, undefined, timeout);
  if (response.exitCode !== 0) throw new Error(`exit ${response.exitCode}: ${response.result}`);
  return response.result.trim();
}
async function run(name: string, command: string, files: string[] = [], timeout = 300) {
  await check(name, command, async () => {
    const detail = await execute(command, timeout);
    const outputs: Output[] = [];
    for (const file of files)
      outputs.push(await download(`${work}/${file}`, file.split("/").pop()!));
    return { detail, outputs };
  });
}
async function launch(name: string, command: string) {
  await check(name, command, async () => {
    const id = name.replaceAll(" ", "-");
    await sandbox!.process.createSession(id);
    const r = await sandbox!.process.executeSessionCommand(id, {
      command: `cd ${work}; ${command}`,
      runAsync: true,
    });
    if (!r.cmdId) throw new Error("Missing async command id");
    return { detail: `Started session ${id}: ${r.cmdId}` };
  });
}

async function shot(name: string, x: number, y: number) {
  await sandbox!.computerUse.mouse.move(x, y);
  await sleep(1000);
  const value = await sandbox!.computerUse.screenshot.takeFullScreen(true);
  const b64 = Object.values(value).find(
    (v): v is string => typeof v === "string" && v.length > 1000,
  );
  if (!b64) throw new Error("Screenshot has no image data");
  const bytes = Buffer.from(b64, "base64");
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    throw new Error("Screenshot is not a PNG");
  if (bytes.readUInt32BE(16) !== 1600 || bytes.readUInt32BE(20) !== 900)
    throw new Error(
      `Unexpected native screenshot dimensions: ${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`,
    );
  const path = `${renders}/${name}.png`;
  await writeFile(path, bytes);
  const native = `renders/${name}-x11.png`;
  await execute(
    sessionEnv +
      `ffmpeg -v error -y -f x11grab -draw_mouse 1 -video_size 1600x900 -i "$DISPLAY" -frames:v 1 -update 1 ${native}`,
  );
  return [{ path, bytes: bytes.length }, await download(`${work}/${native}`, `${name}-x11.png`)];
}
try {
  log(`Creating ${snapshot} verification sandbox`);
  const client = new Daytona();
  const verifyRun = randomUUID();
  const params = {
    snapshot,
    autoStopInterval: 15,
    autoDeleteInterval: 0,
    labels: { app: "avenire-v5-verify", verifyRun },
    networkBlockAll: true,
  };
  for (let attempt = 1; ; attempt++) {
    try {
      sandbox = await client.create(params, { timeout: 300 });
      break;
    } catch (error) {
      // Creation can reset the connection after acceptance; reconcile before retrying.
      for await (const existing of client.list({ labels: { verifyRun } })) {
        sandbox = existing;
        break;
      }
      if (sandbox) {
        await sandbox.waitUntilStarted(300);
        break;
      }
      if (attempt === 3) throw error;
      log(`Sandbox creation transport failed; reconciled no accepted sandbox, retry ${attempt}`);
      await sleep(2000 * attempt);
    }
  }
  await writeFile(
    `${out}/sandbox.json`,
    JSON.stringify(
      { id: sandbox.id, snapshot, createdAt: new Date().toISOString(), networkBlockAll: true },
      null,
      2,
    ),
  );
  for (let attempt = 1; ; attempt++) {
    try {
      await sandbox.process.executeCommand(
        `mkdir -p ${work}/renders ${work}/kits ${work}/mixed/Projects`,
      );
      break;
    } catch (e) {
      if (attempt === 6) throw e;
      await sleep(2000 * attempt);
    }
  }
  for (const file of [
    "plot-render.py",
    "scenes.py",
    "kicad.py",
    "report.tex",
    "node.mjs",
    "widgets.py",
    "integrity.py",
    "interaction.html",
    "desktop-cdp.py",
    "x11-state.py",
    "theme-comparison.py",
  ])
    await sandbox.fs.uploadFile(
      await readFile(new URL("./verify/" + file, import.meta.url)),
      `${work}/${file}`,
    );
  const kitDir = new URL("../../widget-kit/dist/kits/", import.meta.url);
  for (const file of await readdir(kitDir))
    await sandbox.fs.uploadFile(await readFile(new URL(file, kitDir)), `${work}/kits/${file}`);
  for (const page of await widgetPages())
    await sandbox.fs.uploadFile(Buffer.from(page.html), `${work}/${page.name}.html`);
  await run(
    "disk",
    'df -h /; du -sh /opt/avenire; free -m; cat /sys/fs/cgroup/memory.max; python -c \'import shutil; free=shutil.disk_usage("/home/daytona").free; print(free,"free bytes"); assert free > 1024**3\'',
  );
  await run(
    "python",
    `python --version && python -c 'import numpy, scipy, pandas, openpyxl, sympy, matplotlib, networkx, sklearn, polars, PIL, imageio, manimgx; from playwright.sync_api import sync_playwright; import sys; assert sys.version_info >= (3,13); print("imports ok")'`,
  );
  await run(
    "node + pnpm (network blocked)",
    `test "$(id -un)" = daytona && node --version && output=$(pnpm --version 2>&1) && printf '%s\n' "$output" && test "$output" = 11.17.0`,
  );
  await run(
    "kicad",
    `kicad-cli version && /usr/bin/python3 -c 'import pcbnew; print(pcbnew.Version())'`,
  );
  await run("tex + ffmpeg", "pdflatex --version | head -1; ffmpeg -version | head -1; pdftoppm -v");
  await run(
    "package inventory",
    `dpkg-query -W bibata-cursor-theme papirus-icon-theme librsvg2-common arc-theme gnome-themes-extra xfce4-whiskermenu-plugin chromium fonts-inter fonts-dejavu-core mousepad poppler-utils kicad xfwm4 xfce4-panel; python -m pip list 2>/dev/null || /usr/local/bin/uv pip list --python /opt/avenire/python/bin/python`,
  );
  for (const kind of ["png", "svg", "gif", "mp4"])
    await run("matplotlib " + kind, `python plot-render.py ${kind}`, [
      `renders/matplotlib.${kind}`,
    ]);
  await run(
    "manimgx inspect",
    "manimgx inspect scenes.py Plot -o renders/manimgx-inspect.png",
    ["renders/manimgx-inspect.png"],
    600,
  );
  await run(
    "manimgx render 2D (cpu)",
    "manimgx render scenes.py Plot -r 1280x720 --fps 30 -o renders/manimgx-plot.mp4",
    ["renders/manimgx-plot.mp4", "renders/manimgx-plot.storyboard.png"],
    900,
  );
  await run(
    "manimgx render 3D (cpu)",
    "manimgx render scenes.py Spatial -r 1280x720 --fps 30 -o renders/manimgx-spatial.mp4",
    ["renders/manimgx-spatial.mp4", "renders/manimgx-spatial.storyboard.png"],
    900,
  );
  await run("kicad board generation", "/usr/bin/python3 kicad.py", [
    "renders/check.kicad_pcb",
    "renders/check.kicad_sch",
  ]);
  await run(
    "kicad PCB SVG",
    "kicad-cli pcb export svg --mode-single --layers F.Cu,F.Silkscreen,Edge.Cuts --page-size-mode 2 --output renders/kicad-board.svg renders/check.kicad_pcb",
    ["renders/kicad-board.svg"],
  );
  await run(
    "kicad PCB PDF",
    "kicad-cli pcb export pdf --mode-single --layers F.Cu,F.Silkscreen,Edge.Cuts --output renders/kicad-board.pdf renders/check.kicad_pcb",
    ["renders/kicad-board.pdf"],
  );
  await run(
    "kicad gerbers",
    `kicad-cli pcb export gerbers --output renders/gerbers/ renders/check.kicad_pcb && python -c 'import shutil;shutil.make_archive("renders/kicad-gerbers","zip","renders/gerbers")'`,
    ["renders/kicad-gerbers.zip"],
  );
  await run(
    "kicad schematic SVG",
    "kicad-cli sch export svg --output renders/sch-svg/ renders/check.kicad_sch && cp renders/sch-svg/*.svg renders/kicad-schematic.svg",
    ["renders/kicad-schematic.svg"],
  );
  await run(
    "latex report",
    "cp report.tex renders/report.tex && cd renders && pdflatex -interaction=nonstopmode -halt-on-error report.tex && pdftoppm -png -singlefile -r 140 report.pdf latex-report",
    ["renders/report.pdf", "renders/latex-report.png"],
  );
  await launch(
    "widget server",
    "nohup python -m http.server 8765 --bind 127.0.0.1 >/tmp/widget-server.log 2>&1 </dev/null",
  );
  await sleep(1000);
  for (const name of ["pendulum", "three-body", "curve-fit", "iso"])
    await run("playwright widget " + name, `python widgets.py ${name}`, [
      `renders/widget-${name}.png`,
    ]);
  await figure({ box: sandbox, work, check, execute, run, download });
  await run("node SVG", "node node.mjs", ["renders/node.svg"]);
  await desktop({ box: sandbox, work, renders, check, execute, run, launch, download, shot });
  await run("media integrity", "python integrity.py");
} catch (e) {
  results.push({
    check: "script",
    ok: false,
    seconds: 0,
    command: "verification setup/orchestration",
    detail: e instanceof Error ? e.message : String(e),
    outputs: [],
  });
  log(String(e));
} finally {
  if (sandbox) {
    await check("sandbox deletion", "sandbox.delete()", async () => {
      for (let attempt = 1; ; attempt++) {
        try {
          await sandbox!.delete(60, true);
          break;
        } catch (e) {
          if (attempt === 4) throw e;
          await sleep(attempt * 2000);
        }
      }
      await writeFile(
        `${out}/sandbox.json`,
        JSON.stringify({ id: sandbox!.id, snapshot, deletedAt: new Date().toISOString() }, null, 2),
      );
      return { detail: `Deleted ${sandbox!.id}` };
    });
  }
  await writeFile(`${out}/verify.json`, JSON.stringify(results, null, 2) + "\n");
  await writeFile(`${renders}/index.html`, await gallery(snapshot, results));
  log(
    `Verification: ${results.filter((r) => r.ok).length}/${results.length} PASS. Gallery: ${renders}/index.html`,
  );
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}
