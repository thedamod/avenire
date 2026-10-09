/** Pi 0.83.0 awaits an async factory before session_start and the first agent turn.
 * Fetch the manifest here so the initial system prompt already knows every gateway tool.
 * This is sandbox code, outside the server's Effect tsconfig; Pi supplies typebox via jiti.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readFile } from "node:fs/promises";

interface RunConfig {
  runId: string;
  apiBaseUrl: string;
}
interface ManifestTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const gatewayMessage = (body: unknown, status: number): string => {
  if (record(body)) {
    if (typeof body.message === "string") return body.message;
    if (typeof body.error === "string") return body.error;
    if (record(body.error) && typeof body.error.message === "string") return body.error.message;
  }
  return `Avenire tool request failed (${status})`;
};

export default async function (pi: ExtensionAPI) {
  const config: RunConfig = JSON.parse(
    await readFile("/home/daytona/workspace/.avenire/run.json", "utf8"),
  );
  if (!config.runId || !config.apiBaseUrl) throw new Error("Avenire run configuration is missing");
  const token = process.env.AVENIRE_RUN_TOKEN;
  if (!token) throw new Error("Avenire run credential is missing");
  const base = config.apiBaseUrl.replace(/\/$/, "");
  const response = await fetch(`${base}/api/ruth-cloud/manifest`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(60_000),
  });
  const manifest: unknown = await response.json();
  if (!response.ok) throw new Error(gatewayMessage(manifest, response.status));
  if (!Array.isArray(manifest)) throw new Error("Avenire returned an invalid tool manifest");
  for (const entry of manifest) {
    if (
      !record(entry) ||
      typeof entry.name !== "string" ||
      !/^[a-z][a-z0-9_]*$/.test(entry.name) ||
      typeof entry.description !== "string" ||
      !record(entry.inputSchema)
    )
      throw new Error("Avenire returned an invalid manifest tool");
    const tool: ManifestTool = {
      name: entry.name,
      description: entry.description,
      inputSchema: entry.inputSchema,
    };
    pi.registerTool({
      name: tool.name,
      label: tool.name,
      description: tool.description,
      promptSnippet: tool.description,
      parameters: Type.Unsafe(tool.inputSchema),
      async execute(_toolCallId, params, signal) {
        const timeout = AbortSignal.timeout(10 * 60_000);
        const result = await fetch(`${base}/api/ruth-cloud/tools/${tool.name}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(params),
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
        const body: unknown = await result.json();
        // Pi catches thrown tool errors, marks isError and lets the model recover.
        if (!result.ok) throw new Error(gatewayMessage(body, result.status));
        return {
          content: [{ type: "text", text: JSON.stringify(body) }],
          details: { tool: tool.name, status: result.status },
        };
      },
    });
  }
  pi.on("before_agent_start", (event) => ({
    systemPrompt:
      `${event.systemPrompt}\n\nAvenire contract:\n` +
      `- Write outputs to /home/daytona/workspace/runs/${config.runId}/out and publish them with publish_output.\n` +
      "- Never edit /inputs in place. Write a modified copy and publish_output with replaces for user-approved sync.\n" +
      "- Finish with publish_report; set status to failed if the task could not be completed.\n",
  }));
}
