/** One AI SDK configuration for chat streaming and checkpointed Cloud steps. */
import { SCREEN_PROFILES } from "@avenire/cloud/screen";
import { type ModelMessage, type StepResult, type ToolSet } from "ai";
import type { RuthModels, RuthModelName } from "../models/index.ts";
import { RUTH_DEFAULT_MODEL } from "../models/index.ts";
import { createImageTransport } from "../tools/images.ts";
import { coordinateContract } from "../tools/computer.ts";
import { RUTH_PROMPT } from "../prompts/ruth.ts";
import { RUTH_CLOUD_PROMPT } from "../prompts/cloud.ts";
import { previewRepairPolicy } from "./preview-repair.ts";

export const createAgent = (options: {
  kind: "ruth" | "ruth-cloud";
  models: RuthModels["Service"];
  name?: RuthModelName;
  fullAccess?: boolean;
  bindTools: (
    images: ReturnType<typeof createImageTransport>,
    profile: import("@avenire/cloud/screen").ScreenProfile,
  ) => { tools: ToolSet; toolApproval: Record<string, "approved"> };
}) => {
  const name = options.name ?? RUTH_DEFAULT_MODEL;
  const capabilities = options.models.capabilities(name);
  const profile = capabilities.screenProfile ?? SCREEN_PROFILES[0];
  const images = createImageTransport(capabilities, options.models.maxImages);
  const bound = options.bindTools(images, profile);
  const system = `${options.kind === "ruth" ? RUTH_PROMPT({ fullAccess: options.fullAccess }) : RUTH_CLOUD_PROMPT()}\n\n${coordinateContract(profile)}`;
  const repair = previewRepairPolicy({
    tools: bound.tools,
    system,
  });
  return {
    model: options.models.languageModel(name),
    ...(options.kind === "ruth" && capabilities.reasoning
      ? { reasoning: capabilities.reasoning }
      : {}),
    system,
    ...bound,
    // Override the SDK's one-step default. Finish naturally, on approval or cancellation.
    stopWhen: () => false,
    prepareStep: ({
      messages,
      steps,
    }: {
      messages: ModelMessage[];
      steps: StepResult<ToolSet>[];
    }) => ({
      ...(options.kind === "ruth" ? repair.prepare(steps) : {}),
      messages: images.prepareMessages(messages),
    }),
  };
};
