/**
 * Live check of the built snapshot (SNAPSHOT.md checklist). Creates one sandbox, runs every
 * check, saves screenshots/recording to OUT_DIR, and always deletes the sandbox.
 *
 * Run: pnpm --filter @avenire/cloud snapshot:verify   (bills a few sandbox-minutes)
 */
import { Daytona } from "@daytonaio/sdk";
import { mkdir, writeFile } from "node:fs/promises";

import { AVENIRE_SNAPSHOT } from "../src/snapshots.ts";

const OUT_DIR = process.env.OUT_DIR ?? `/tmp/avenire-snapshot/${AVENIRE_SNAPSHOT}`;
const results: { check: string; ok: boolean; detail: string }[] = [];
const log = (line: string) => process.stdout.write(`${line}\n`);

const SCENE = `import manimgx as m

class Check(m.Scene):
    def construct(self) -> None:
        formula = m.MathTex(r"\\int_0^1 x^2\\,dx = \\tfrac{1}{3}")
        self.play(m.Write(formula), run_time=1)
        self.wait(0.5)
`;
const PAGE = `<!doctype html><html><body style="margin:0;background:#1b1c28;color:#ebe9e1;font:16px sans-serif">
<svg width="320" height="120"><path d="M10 100 L110 20 L210 80 L310 10" fill="none" stroke="#a5a2e9" stroke-width="1"/></svg>
<script>console.log("widget ok")</script></body></html>`;
const SHOT = `from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 360, "height": 160})
    logs = []
    page.on("console", lambda m: logs.append(m.text))
    page.goto("file:///home/daytona/work/page.html")
    page.screenshot(path="/home/daytona/work/page.png")
    print("console:", logs)
    b.close()
`;

const daytona = new Daytona();
log(`Creating a sandbox from ${AVENIRE_SNAPSHOT}…`);
const sandbox = await daytona.create(
  {
    snapshot: AVENIRE_SNAPSHOT,
    autoStopInterval: 15,
    autoDeleteInterval: 0,
    labels: { app: "snapshot-verify" },
  },
  { timeout: 300 },
);
const run = async (check: string, command: string, timeout = 300) => {
  const started = Date.now();
  const response = await sandbox.process.executeCommand(
    command,
    "/home/daytona/work",
    undefined,
    timeout,
  );
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const detail = `${response.result.trim().split("\n").slice(-6).join(" | ")} (${seconds}s)`;
  results.push({ check, ok: response.exitCode === 0, detail });
  log(`${response.exitCode === 0 ? "PASS" : "FAIL"} ${check}: ${detail}`);
  return response;
};
const save = async (name: string, base64: string) => {
  await writeFile(`${OUT_DIR}/${name}`, Buffer.from(base64, "base64"));
  log(`saved ${OUT_DIR}/${name}`);
};
const imageOf = (value: object) =>
  Object.values(value).find(
    (field): field is string => typeof field === "string" && field.length > 1000,
  ) ?? "";

try {
  await mkdir(OUT_DIR, { recursive: true });
  await sandbox.process.executeCommand("mkdir -p /home/daytona/work");
  await run("disk", "df -h / | tail -1; du -sh /opt/avenire 2>/dev/null | tail -1");
  await run(
    "python",
    "python --version && python -c 'import numpy, scipy, pandas, openpyxl, sympy, matplotlib, networkx, sklearn, polars, PIL, imageio, manimgx; print(\"imports ok\")'",
  );
  await run("node + pnpm", "node --version && pnpm --version");
  await run(
    "kicad",
    "kicad-cli version && /usr/bin/python3 -c 'import pcbnew; print(pcbnew.Version())'",
  );
  await run("tex + ffmpeg", "pdflatex --version | head -1 && ffmpeg -version | head -1");
  await sandbox.fs.uploadFile(Buffer.from(SCENE), "/home/daytona/work/scene.py");
  await run(
    "manimgx inspect",
    "manimgx inspect scene.py -o check.storyboard.png; ls -la *.png",
    600,
  );
  await run(
    "manimgx render (cpu)",
    "manimgx render scene.py -r 640x360 --fps 15; ls -la *.mp4 || find . -name '*.mp4' -ls",
    900,
  );
  for (const name of ["Check.mp4", "Check.storyboard.png", "check.storyboard.png"]) {
    const found = await sandbox.process.executeCommand(
      `find /home/daytona/work -name '${name}' | head -1`,
    );
    const path = found.result.trim();
    if (path) await writeFile(`${OUT_DIR}/manimgx-${name}`, await sandbox.fs.downloadFile(path));
  }
  await sandbox.fs.uploadFile(Buffer.from(PAGE), "/home/daytona/work/page.html");
  await sandbox.fs.uploadFile(Buffer.from(SHOT), "/home/daytona/work/shot.py");
  const shot = await run("playwright screenshot", "python shot.py && ls -la page.png");
  if (shot.exitCode === 0)
    await writeFile(
      `${OUT_DIR}/widget.png`,
      await sandbox.fs.downloadFile("/home/daytona/work/page.png"),
    );

  const start = Date.now();
  await sandbox.computerUse.start();
  results.push({
    check: "computer use start",
    ok: true,
    detail: `${((Date.now() - start) / 1000).toFixed(1)}s`,
  });
  await new Promise((resolve) => setTimeout(resolve, 12_000));
  const display = await sandbox.computerUse.display.getInfo();
  log(`display: ${JSON.stringify(display)}`);
  const recording = await sandbox.computerUse.recording.start("verify");
  await sandbox.computerUse.mouse.move(512, 384);
  await sandbox.computerUse.mouse.click(200, 200);
  const screenshot = await sandbox.computerUse.screenshot.takeFullScreen(true);
  await save("desktop.png", imageOf(screenshot));
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  const stopped = await sandbox.computerUse.recording.stop(recording.id);
  results.push({
    check: "recording",
    ok: stopped.status !== "failed",
    detail: `${stopped.status} ${stopped.durationSeconds ?? "?"}s ${stopped.sizeBytes ?? "?"} bytes at ${stopped.filePath}`,
  });
  await writeFile(`${OUT_DIR}/recording.mp4`, await sandbox.fs.downloadFile(stopped.filePath));
  const tree = await sandbox.computerUse.display.getWindows();
  log(`windows: ${JSON.stringify(tree).slice(0, 400)}`);
} catch (error) {
  results.push({
    check: "script",
    ok: false,
    detail: error instanceof Error ? error.message : String(error),
  });
} finally {
  await sandbox
    .delete()
    .catch((error: unknown) => log(`DELETE FAILED for ${sandbox.id}: ${String(error)}`));
  log("\nSummary");
  for (const result of results)
    log(`${result.ok ? "PASS" : "FAIL"}  ${result.check}  ${result.detail}`);
  await writeFile(`${OUT_DIR}/verify.json`, JSON.stringify(results, null, 2));
  if (results.some((result) => !result.ok)) process.exitCode = 1;
}
