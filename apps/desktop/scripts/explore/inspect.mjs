import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

// This developer tool is deliberately separate from Electron IPC and Ruth's remote tools.
// The executable is installed by the operator; nothing is downloaded or bundled here.
export async function runDesktop(binary, args) {
  return new Promise((resolveResult, reject) => {
    execFile(
      binary,
      args,
      { encoding: "utf8", timeout: 20_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        let envelope;
        try {
          envelope = JSON.parse(stdout);
        } catch {
          reject(
            new Error(
              `agent-desktop returned no JSON (${error?.code ?? "invalid output"}): ${stderr.slice(0, 500)}`,
            ),
          );
          return;
        }
        if (envelope?.ok !== true || !Object.hasOwn(envelope, "data") || error) {
          reject(
            new Error(
              `agent-desktop failed: ${JSON.stringify(envelope.error ?? { code: error?.code })}`,
            ),
          );
          return;
        }
        resolveResult({ raw: stdout, envelope });
      },
    );
  });
}

export function summarize(snapshot) {
  const data = snapshot.data;
  if (!data || typeof data.tree !== "object" || data.tree === null || Array.isArray(data.tree))
    throw new Error("Snapshot did not contain an accessibility tree");
  const result = {
    complete: data.complete ?? null,
    refs: data.ref_count ?? null,
    nodes: 0,
    namedNodes: 0,
    roles: Object.create(null),
    mode: "accessibility",
    imageIncluded: false,
  };
  function visit(node) {
    if (!node || typeof node !== "object") return;
    result.nodes++;
    if (node.name) result.namedNodes++;
    const role = String(node.role ?? "unknown");
    result.roles[role] = (result.roles[role] ?? 0) + 1;
    for (const child of node.children ?? []) visit(child);
  }
  visit(data.tree);
  return result;
}

export async function inspect(
  {
    binary = "agent-desktop",
    app,
    windowId,
    out,
    screenshot = false,
    maxDepth = 30,
    session = `avenire-${randomUUID()}`,
  },
  run = runDesktop,
) {
  if (!app?.trim() || !out?.trim()) throw new Error("--app and --out are required");
  if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 50)
    throw new Error("--max-depth must be 1..50");
  const directory = resolve(out);
  // A fresh directory prevents overwriting a previous observation or following file symlinks.
  await mkdir(directory, { mode: 0o700 });
  const save = (name, content) =>
    writeFile(resolve(directory, name), content, { flag: "wx", mode: 0o600 });
  const manifest = {
    format: 1,
    capturedAt: new Date().toISOString(),
    app,
    requestedWindowId: windowId ?? null,
    binary,
    screenshotRequested: screenshot,
    session,
    state: "collecting",
  };
  try {
    const scopedRun = (args) => run(binary, [...args, "--session", session]);
    const status = await scopedRun(["status"]);
    await save("status.json", status.raw);
    const scope = ["--app", app, ...(windowId ? ["--window-id", windowId] : [])];
    const snapshot = await scopedRun([
      "snapshot",
      ...scope,
      "--include-bounds",
      "--max-depth",
      String(maxDepth),
      "--timeout-ms",
      "10000",
    ]);
    // Preserve byte-for-byte what a JSON tool-result consumer would receive.
    await save("model-visible.json", snapshot.raw);
    const summary = summarize(snapshot.envelope);
    await save("summary.json", JSON.stringify(summary, null, 2));
    if (screenshot) {
      // Pin capture to the window resolved by snapshot, never to the foreground desktop.
      const id =
        snapshot.envelope.data.window?.id ?? snapshot.envelope.data.window?.window_id ?? windowId;
      if (!id) throw new Error("Snapshot did not identify a window; screenshot refused");
      const image = await scopedRun(["screenshot", "--app", app, "--window-id", String(id)]);
      if (image.envelope.data.format !== "png" || typeof image.envelope.data.data !== "string")
        throw new Error("Unsupported screenshot envelope");
      const png = Buffer.from(image.envelope.data.data, "base64");
      if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
        throw new Error("Screenshot is not a PNG");
      await save("window.png", png);
      manifest.screenshotFile = "window.png";
    }
    manifest.state = "complete";
    manifest.modelPayload = "model-visible.json";
    manifest.screenshotIsSeparate = true;
    await save("manifest.json", JSON.stringify(manifest, null, 2));
    return { directory, ...summary, screenshotFile: manifest.screenshotFile ?? null };
  } catch (error) {
    await save(
      "failure.json",
      JSON.stringify({ ...manifest, state: "failed", error: String(error) }, null, 2),
    );
    throw error;
  }
}

export async function main(args) {
  const { values } = parseArgs({
    args,
    options: {
      app: { type: "string" },
      "window-id": { type: "string" },
      out: { type: "string" },
      binary: { type: "string" },
      screenshot: { type: "boolean", default: false },
      "max-depth": { type: "string", default: "30" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      "node apps/desktop/scripts/explore/inspect.mjs --app NAME --out NEW_DIRECTORY [--window-id ID] [--screenshot] [--binary PATH] [--max-depth 1..50]",
    );
    return;
  }
  const result = await inspect({
    binary: values.binary,
    app: values.app,
    windowId: values["window-id"],
    out: values.out,
    screenshot: values.screenshot,
    maxDepth: Number(values["max-depth"]),
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(String(error));
    process.exitCode = 1;
  });
}
