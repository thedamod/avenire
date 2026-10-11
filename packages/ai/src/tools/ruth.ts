/** Bind the shared tool backbone to one request; local tools supply skills and page context. */
import type { PageContext, ThreadId, UserId } from "@avenire/contracts";
import type { ChatSandboxes } from "@avenire/cloud/chat-sandbox";
import { toAiSdkTools } from "./ai-sdk.ts";
import type { ArtifactStore } from "../outputs/artifacts.ts";
import type { AgentContext } from "./core.ts";
import { sandboxToolRegistry } from "./sandbox-tools.ts";
import type { RuthKitServices } from "./library.ts";
import { tool, type ToolSet } from "ai";
import type * as Context from "effect/Context";
import { askUserSpec, getPageContextSpec, type PageContextResult, ruthToolSpecs } from "./index.ts";
import { VISUAL_BUDGETS, VISUAL_RUNTIME } from "./page.ts";
import { loadSkillTool } from "./skills.ts";

export type RuthToolServices = RuthKitServices | ChatSandboxes | ArtifactStore;
export interface RuthTurn {
  readonly userId: UserId;
  readonly threadId: ThreadId;
  readonly page: PageContext;
  readonly fullAccess: boolean;
  readonly timeZone: string;
  readonly existingVisuals: PageContextResult["existingVisuals"];
}
export const chatToolNames = Object.keys(ruthToolSpecs).filter(
  (name) => !["load_skill", "get_page_context", "ask_user"].includes(name),
);
export const createRuthTools = (services: Context.Context<RuthToolServices>, turn: RuthTurn) => {
  const ctx: AgentContext = {
    agent: "ruth",
    userId: turn.userId,
    threadId: turn.threadId,
    fullAccess: turn.fullAccess,
    timeZone: turn.timeZone,
    page: turn.page,
  };
  const { tools, toolApproval } = toAiSdkTools<RuthToolServices>(
    chatToolNames,
    ctx,
    services,
    sandboxToolRegistry,
  );
  const boundTools: ToolSet = {
    ...tools,
    load_skill: loadSkillTool(),
    get_page_context: tool({
      ...getPageContextSpec,
      execute: (): PageContextResult => ({
        ...turn.page,
        runtime: VISUAL_RUNTIME,
        budgets: VISUAL_BUDGETS,
        existingVisuals: turn.existingVisuals,
      }),
    }),
    ask_user: tool(askUserSpec),
  };
  return { tools: boundTools, toolApproval };
};
