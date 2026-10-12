/** One AI SDK configuration for chat streaming and checkpointed Cloud steps. */
import { stepCountIs, type ModelMessage, type ToolSet } from "ai";
import type { RuthModels, RuthModelName } from "../models/index.ts";
import { RUTH_DEFAULT_MODEL, screenProfileForModel } from "../models/index.ts";
import { createImageTransport } from "../tools/images.ts";
import { coordinateContract } from "../tools/computer.ts";
import { RUTH_PROMPT } from "../prompts/ruth.ts";
import { RUTH_CLOUD_PROMPT } from "../prompts/cloud.ts";

export const createAgent = (options: {
  kind: "ruth" | "ruth-cloud";
  models: RuthModels["Service"];
  name?: RuthModelName;
  fullAccess?: boolean;
  maxSteps: number;
  bindTools: (
    images: ReturnType<typeof createImageTransport>,
    profile: import("@avenire/cloud/screen").ScreenProfile,
  ) => { tools: ToolSet; toolApproval: Record<string, "approved"> };
}) => {
  const name = options.name ?? RUTH_DEFAULT_MODEL;
  const capabilities = options.models.capabilities(name);
  const profile = capabilities.screenProfile ?? screenProfileForModel("");
  const images = createImageTransport(capabilities, options.models.maxImages);
  const bound = options.bindTools(images, profile);
  return {
    model: options.models.languageModel(name),
    system: `${options.kind === "ruth" ? RUTH_PROMPT({ fullAccess: options.fullAccess }) : RUTH_CLOUD_PROMPT()}\n\n${coordinateContract(profile)}`,
    ...bound,
    stopWhen: stepCountIs(options.maxSteps),
    prepareStep: ({ messages }: { messages: ModelMessage[] }) => ({
      messages: images.prepareMessages(messages),
    }),
  };
};
