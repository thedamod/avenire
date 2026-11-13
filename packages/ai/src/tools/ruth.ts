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
import {
  readScreenSpec,
  createNativeAnnotationTool,
  createNativeDiagramTool,
  createNativeCursorTool,
  createNativePresentationTool,
  createNativeVisualizationTool,
} from "./native-overlay-specs.ts";

import { makeComputerRegistry, type ComputerServices } from "./computer.ts";
import { recordingRegistry } from "./recording.ts";
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
  readonly nativeScreenAvailable?: boolean | undefined;
  readonly nativeScreenCapturedAt?: string | undefined;
  readonly nativeCursor?: import("@avenire/contracts").DesktopCursorPosition | undefined;
  readonly nativePresentation?:
    | import("@avenire/contracts").DesktopPresentationObservation
    | undefined;
  readonly scope?: import("@avenire/contracts").ChatScope | undefined;
  readonly threadId: ThreadId;
  readonly page: PageContext;
  readonly fullAccess: boolean;
  readonly timeZone: string;
  readonly existingVisuals: PageContextResult["existingVisuals"];
}
export const chatToolNames = Object.keys(ruthToolSpecs).filter(
  (name) =>
    ![
      "load_skill",
      "get_page_context",
      "ask_user",
      "read_screen",
      "native_annotate",
      "native_visualize",
      "native_diagram",
      "native_cursor",
      "native_presentation",
    ].includes(name),
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
    scope: turn.scope,
    threadId: turn.threadId,
    fullAccess: turn.fullAccess,
    timeZone: turn.timeZone,
    page: turn.page,
  };
  const { tools, toolApproval } = toAiSdkTools<RuthToolServices>(
    chatToolNames,
    ctx,
    services,
    {
      ...sandboxToolRegistry,
      ...makeComputerRegistry(profile, 100).registry,
      ...recordingRegistry,
    },
    images,
  );
  const boundTools: ToolSet = {
    ...tools,
    ...(turn.nativeScreenAvailable &&
    turn.page.surface === "ephemeral" &&
    turn.page.platform === "desktop"
      ? { read_screen: tool(readScreenSpec) }
      : {}),
    ...(turn.nativeScreenCapturedAt && turn.nativePresentation &&
    turn.page.surface === "ephemeral" &&
    turn.page.platform === "desktop"
      ? {
          native_annotate: createNativeAnnotationTool(turn.nativeScreenCapturedAt),
          native_visualize: createNativeVisualizationTool(turn.nativeScreenCapturedAt),
          native_diagram: createNativeDiagramTool(turn.nativeScreenCapturedAt),
          ...(turn.nativeCursor
            ? {
                native_cursor: createNativeCursorTool(
                  turn.nativeScreenCapturedAt,
                  turn.nativeCursor,
                ),
              }
            : {}),
          ...(turn.nativePresentation
            ? {
                native_presentation: createNativePresentationTool(
                  turn.nativeScreenCapturedAt,
                  turn.nativePresentation,
                ),
              }
            : {}),
        }
      : {}),
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
