import type { PrepareStepResult, StepResult, ToolSet } from "ai";

type Steps = ReadonlyArray<Pick<StepResult<ToolSet>, "content">>;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Derive state from this turn's results so concurrent turns never share repair state. */
export function previewRepairState(steps: Steps) {
  let activated = false;
  let failed = false;
  let delivered = false;
  for (const step of steps) {
    for (const part of step.content) {
      if (part.type === "tool-error" && part.toolName === "preview_widget") {
        activated = true;
        failed = true;
        delivered = false;
      } else if (part.type === "tool-result" && part.toolName === "preview_widget") {
        const output: unknown = part.output;
        failed =
          !record(output) ||
          !Array.isArray(output.consoleMessages) ||
          output.consoleMessages.some(
            (entry: unknown) =>
              record(entry) && (entry.level === "error" || entry.level === "uncaught"),
          );
        activated ||= failed;
        delivered = false;
      } else if (part.type === "tool-result" && part.toolName === "render_widget") {
        const output: unknown = part.output;
        delivered = !failed && record(output) && typeof output.assetId === "string";
      }
    }
  }
  return { activated, failed, delivered };
}

export function previewRepairPolicy(options: { tools: ToolSet; system: string }) {
  const prepare = (steps: Steps): PrepareStepResult<ToolSet> => {
    const state = previewRepairState(steps);
    if (!state.activated) return undefined;
    if (state.failed)
      return {
        activeTools: Object.keys(options.tools).filter((name) => name !== "render_widget"),
        system: `${options.system}\nThe latest preview failed. Repair the exact error and run preview_widget again; do not render while it fails. Batch edits/builds, skip embellishment and reference browsing, and deliver after a clean preview. If repair is impossible, explain the actual blocking error without claiming delivery.`,
      };
    return {
      system: `${options.system}\nThe repaired preview is clean. Deliver it with render_widget if not yet delivered, close the sandbox when finished, and explain it briefly.`,
    };
  };
  return { prepare };
}
