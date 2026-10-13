/** Bind the shared tool backbone to one request; local tools supply skills and page context. */
import type { PageContext, ThreadId, UserId } from "@avenire/contracts";
import type { ChatSandboxes } from "@avenire/cloud/chat-sandbox";
import { WIDGET_THEME_TOKENS } from "@avenire/ui/tokens";
import type { ImageTransport } from "./images.ts";
import { toAiSdkTools } from "./ai-sdk.ts";
import type { AssetStore } from "../outputs/assets.ts";
import type { AgentContext } from "./core.ts";
import { sandboxToolRegistry } from "./sandbox-tools.ts";
import type { RuthKitServices } from "./library.ts";
import { tool, type ToolSet } from "ai";
import type * as Context from "effect/Context";
import { askUserSpec, getPageContextSpec, type PageContextResult, ruthToolSpecs } from "./index.ts";
import { VISUAL_BUDGETS, VISUAL_RUNTIME } from "./page.ts";
import { loadSkillTool } from "./skills.ts";

import { makeComputerRegistry, type ComputerServices } from "./computer.ts";
import type { ScreenProfile } from "@avenire/cloud/screen";
import type { WidgetPreview } from "./preview.ts";
export type RuthToolServices =
  | ComputerServices
  | WidgetPreview
  | RuthKitServices
  | ChatSandboxes
  | AssetStore;
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
export const createRuthTools = (
  services: Context.Context<RuthToolServices>,
  turn: RuthTurn,
  images?: ImageTransport,
  profile?: ScreenProfile,
) => {
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
    { ...sandboxToolRegistry, ...makeComputerRegistry(profile, 100).registry },
    images,
  );
  const boundTools: ToolSet = {
    ...tools,
    load_skill: loadSkillTool(),
    get_page_context: tool({
      ...getPageContextSpec,
      execute: (): PageContextResult => ({
        ...turn.page,
        themeTokens: {
          ...turn.page.themeTokens,
          ...WIDGET_THEME_TOKENS[turn.page.colorScheme],
        },
        fonts: {
          ...turn.page.fonts,
          mono: WIDGET_THEME_TOKENS[turn.page.colorScheme]["--font-mono"],
        },
        runtime: VISUAL_RUNTIME,
        budgets: VISUAL_BUDGETS,
        existingVisuals: turn.existingVisuals,
      }),
    }),
    ask_user: tool(askUserSpec),
  };
  return { tools: boundTools, toolApproval };
};
