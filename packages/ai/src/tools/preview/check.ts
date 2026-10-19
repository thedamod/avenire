/* eslint-disable no-await-in-loop, no-unmodified-loop-condition -- Fixtures run sequentially for cold/warm measurements; the sampling flag is changed by the owning task. */
/** Live local browser checks, deliberately zero model/provider/Daytona calls. */
import { ChatSandboxes } from "@avenire/cloud/chat-sandbox";
import { UserId } from "@avenire/contracts";
import * as Effect from "effect/Effect";
import { execFile } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { makeWidgetPreview } from "../preview.ts";
import type { PreviewReport } from "./report.ts";

const output = "/tmp/avenire-preview-check";
await mkdir(output, { recursive: true });
const unused = () => Effect.die("The preview check must never call Daytona");
const sandboxes = ChatSandboxes.of({
  target: unused,
  exec: unused,
  write: unused,
  read: unused,
  readArtifact: unused,
  close: unused,
  sweep: unused(),
});
const service = await Effect.runPromise(
  makeWidgetPreview().pipe(Effect.provideService(ChatSandboxes, sandboxes)),
);
const ctx = {
  userId: UserId.make("preview-check"),
  agent: "ruth" as const,
  fullAccess: false,
  timeZone: "UTC",
};
const api = await readFile(new URL("../../../../widget-kit/API.md", import.meta.url), "utf8");
const examples = [...api.matchAll(/## Complete widget: ([^\n]+)\n\n```html\n([\s\S]*?)\n```/g)].map(
  (match) => ({ name: match[1]!, html: match[2]! }),
);
if (examples.length < 4) throw new Error("Expected four complete API.md widget examples");
for (const name of ["gradient-descent", "double-pendulum"]) {
  const path = `/tmp/ruth-demo/${name}.html`;
  try {
    examples.push({ name: `ruth-${name}`, html: await readFile(path, "utf8") });
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
    console.log(`SKIP ${path}: absent`);
  }
}
const broken = `<label for="rate">η</label><input id="rate" type="range" min="0" max="10" value="1"><output>1</output><button id="step">Step</button><script>
document.getElementById('step').onclick=()=>{console.debug('before injected error');throw new TypeError('Injected Step failure')};
document.getElementById('rate').oninput=e=>{document.querySelector('output').textContent=e.target.value==='10'?'NaN':e.target.value;document.body.style.width=e.target.value==='10'?'1900px':'auto'};
</script>`;
// Cold = first fresh daemon/browser; warm = next fresh daemon/browser with hot OS cache.
const fixtures = [
  { name: "broken-cold", html: broken },
  { name: "broken-warm", html: broken },
  ...examples,
];
const processRows = () =>
  new Promise<{ pid: number; parent: number; rss: number; args: string }[]>((resolve, reject) =>
    execFile("ps", ["-eo", "pid=,ppid=,rss=,args="], (error, out) => {
      if (error) return reject(error);
      resolve(
        out
          .trim()
          .split("\n")
          .map((line) => {
            const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/)!;
            return { pid: Number(m[1]), parent: Number(m[2]), rss: Number(m[3]), args: m[4]! };
          }),
      );
    }),
  );
const owned = (rows: Awaited<ReturnType<typeof processRows>>) => {
  const pids = new Set(
    rows
      .filter((r) => /agent-browser/.test(r.args) && /--session preview-/.test(r.args))
      .map((r) => r.pid),
  );
  for (let i = 0; i < 10; i++) for (const row of rows) if (pids.has(row.parent)) pids.add(row.pid);
  return rows.filter((r) => pids.has(r.pid));
};
const timings: unknown[] = [];
for (const fixture of fixtures) {
  let peakProcesses = 0,
    peakRssKiB = 0,
    sampling = true;
  const tracked = new Set<number>();
  const sampler = (async () => {
    while (sampling) {
      const rows = owned(await processRows());
      for (const row of rows) tracked.add(row.pid);
      peakProcesses = Math.max(peakProcesses, rows.length);
      peakRssKiB = Math.max(
        peakRssKiB,
        rows.reduce((sum, r) => sum + r.rss, 0),
      );
      await delay(150);
    }
  })();
  const started = performance.now();
  let report: PreviewReport;
  try {
    report = await Effect.runPromise(
      service.preview(
        {
          html: fixture.html,
          width: 640,
          appearance: fixture.name.includes("iso") ? "dark" : "light",
        },
        ctx,
      ),
    );
  } finally {
    sampling = false;
    await sampler;
  }
  const elapsedMs = Math.round(performance.now() - started);
  const remaining = (await processRows()).filter((r) => tracked.has(r.pid));
  if (remaining.length)
    throw new Error(`Preview left processes: ${remaining.map((r) => r.pid).join(",")}`);
  if (report.screenshot)
    await writeFile(
      `${output}/${fixture.name.replace(/[^\w-]/g, "-")}-contact-sheet.png`,
      Buffer.from(report.screenshot.data, "base64"),
    );
  const sanitized = {
    ...report,
    ...(report.screenshot
      ? { screenshot: { ...report.screenshot, data: "<PNG payload omitted in evidence JSON>" } }
      : {}),
  };
  await writeFile(
    `${output}/${fixture.name.replace(/[^\w-]/g, "-")}.json`,
    JSON.stringify(sanitized, null, 2),
  );
  const timing = {
    name: fixture.name,
    elapsedMs,
    peakProcesses,
    peakRssMiB: Math.round(peakRssKiB / 1024),
    remainingProcesses: remaining.length,
    ok: report.ok,
    interactions: report.interactions.length,
    errors: report.errors.length,
  };
  timings.push(timing);
  console.log(JSON.stringify(timing));
  console.log(report.summary);
  if (fixture.name.startsWith("broken")) {
    if (
      !report.errors.some(
        (e) => e.message.includes("Injected Step failure") && e.afterAction?.includes("Step"),
      )
    )
      throw new Error("Missing action-tagged click error");
    if (!report.errors.some((e) => e.kind === "nonfinite" && e.afterAction?.includes("set max")))
      throw new Error("Missing action-tagged NaN");
    if (!report.errors.some((e) => e.kind === "overflow" && e.afterAction?.includes("set max")))
      throw new Error("Missing action-tagged overflow");
  }
}
await writeFile(`${output}/timings.json`, JSON.stringify(timings, null, 2));
if (owned(await processRows()).length) throw new Error("Preview processes remain");
console.log(`Evidence: ${output}; no preview processes remain.`);
