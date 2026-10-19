import { CLOUD_WORKSPACE } from "@avenire/cloud/cloud-box";

export const RUN_WALL_CLOCK = 4 * 60 * 60 * 1000;
export const POLL_INTERVAL = 10_000;
export const LOG_TAIL_CHARS = 8_000;
export const AVENIRE_DIR = `${CLOUD_WORKSPACE}/.avenire`;
export const PI_EXTENSION = "/home/daytona/.avenire/pi/avenire.ts";
export const runPaths = (runId: string) => {
  const runDir = `${CLOUD_WORKSPACE}/runs/${runId}`;
  return { runDir, outDir: `${runDir}/out`, prompt: `${runDir}/prompt.md` };
};
export const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

/** Pi 0.83.0 README/settings/environment docs: offline still permits model and extension HTTP calls. */
export const piCommand = (runId: string, model: string): string =>
  [
    "PI_TELEMETRY=0 pi -p --mode json --no-session --offline --no-approve",
    "--no-extensions --no-skills --no-prompt-templates --no-context-files",
    `--provider anthropic --model ${shellQuote(model)}`,
    `--extension ${PI_EXTENSION} ${shellQuote(`@${runPaths(runId).prompt}`)}`,
  ].join(" ");

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
/** JSON lines may begin with a truncated record in a tail; ignore incomplete/diagnostic lines. */
export const parsePiLogs = (
  logs: string,
): { assistantText: string | null; started: boolean; error: string | null } => {
  let assistantText: string | null = null;
  let started = false;
  let error: string | null = null;
  const message = (value: unknown) => {
    if (!object(value) || value.role !== "assistant") return;
    if (Array.isArray(value.content)) {
      const text = value.content
        .filter(
          (part): part is { type: "text"; text: string } =>
            object(part) && part.type === "text" && typeof part.text === "string",
        )
        .map((part) => part.text)
        .join("\n")
        .trim();
      if (text) assistantText = text;
    }
    if (value.stopReason === "stop" || value.stopReason === "toolUse") error = null;
    if (value.stopReason === "error" || value.stopReason === "aborted")
      error =
        typeof value.errorMessage === "string"
          ? value.errorMessage
          : `Pi assistant stopped: ${value.stopReason}`;
  };
  for (const line of logs.split("\n")) {
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (!object(event)) continue;
    if (
      ["agent_start", "turn_start", "message_start", "message_end", "agent_end"].includes(
        String(event.type),
      )
    )
      started = true;
    if (event.type === "message_end" || event.type === "turn_end") message(event.message);
    if (event.type === "agent_end" && Array.isArray(event.messages))
      event.messages.forEach(message);
    if (event.type === "auto_retry_end") {
      if (event.success === true) error = null;
      else if (typeof event.finalError === "string") error = event.finalError;
    }
  }
  return { assistantText, started, error };
};
