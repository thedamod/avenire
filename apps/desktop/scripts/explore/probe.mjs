import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { inspect, runDesktop } from "./inspect.mjs";

export async function probe(
  { capture, ref, mode, allowInput, out, binary = "agent-desktop" },
  run = runDesktop,
) {
  if (!allowInput)
    throw new Error("Probe requires --allow-input; it changes the selected app or real cursor");
  if (!capture || !out) throw new Error("--capture and --out are required");
  if (!["semantic-click", "cursor-hover"].includes(mode))
    throw new Error("--mode must be semantic-click or cursor-hover");
  const snapshot = JSON.parse(await readFile(resolve(capture, "model-visible.json"), "utf8"));
  const manifest = JSON.parse(await readFile(resolve(capture, "manifest.json"), "utf8"));
  if (
    manifest.state !== "complete" ||
    snapshot.ok !== true ||
    !snapshot.data.window?.id ||
    !manifest.session
  )
    throw new Error("Probe requires a completed, window-scoped capture");
  function contains(node) {
    return !!node && (node.ref_id === ref || (node.children ?? []).some(contains));
  }
  if (!/^@[^:]+:e\d+$/.test(ref ?? "") || !contains(snapshot.data.tree))
    throw new Error("--ref must belong to the supplied capture");
  const directory = resolve(out);
  await mkdir(directory, { mode: 0o700 });
  const save = (name, data) =>
    writeFile(resolve(directory, name), data, { flag: "wx", mode: 0o600 });
  const request = {
    mode,
    ref,
    app: manifest.app,
    windowId: snapshot.data.window.id,
    capturedAt: new Date().toISOString(),
  };
  await save("request.json", JSON.stringify(request, null, 2));
  try {
    // Exactly one attempt. Even a failure can follow delivery; never substitute or retry input.
    const actionArgs = mode === "semantic-click" ? ["click", ref] : ["--headed", "hover", ref];
    const action = await run(binary, [...actionArgs, "--session", manifest.session]);
    await save("action.json", action.raw);
    const observation = await inspect(
      {
        binary,
        app: manifest.app,
        windowId: snapshot.data.window.id,
        session: manifest.session,
        out: resolve(directory, "after"),
      },
      run,
    );
    return {
      directory,
      action: action.envelope.data,
      observation,
      verification:
        "Read after/model-visible.json to check the intended app effect; command success alone does not prove it.",
    };
  } catch (error) {
    await save(
      "failure.json",
      JSON.stringify(
        { error: String(error), retry: "Do not repeat input without inspecting live state." },
        null,
        2,
      ),
    );
    throw error;
  }
}

export async function main(args) {
  const { values } = parseArgs({
    args,
    options: {
      capture: { type: "string" },
      ref: { type: "string" },
      mode: { type: "string" },
      out: { type: "string" },
      binary: { type: "string" },
      "allow-input": { type: "boolean", default: false },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      "node apps/desktop/scripts/explore/probe.mjs --capture DIRECTORY --ref QUALIFIED_REF --mode semantic-click|cursor-hover --out NEW_DIRECTORY --allow-input [--binary PATH]",
    );
    return;
  }
  console.log(
    JSON.stringify(
      await probe({
        capture: values.capture,
        ref: values.ref,
        mode: values.mode,
        out: values.out,
        binary: values.binary,
        allowInput: values["allow-input"],
      }),
      null,
      2,
    ),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(String(error));
    process.exitCode = 1;
  });
}
