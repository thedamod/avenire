import { WIDGET_THEME_TOKENS } from "@avenire/ui/tokens";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { getPageContextSpec, PageContextResult } from "../tools/index.ts";
import { VISUAL_BUDGETS, VISUAL_RUNTIME } from "../tools/page.ts";
import { WidgetPreview } from "../tools/preview.ts";
import { registerTool } from "../tools/registration.ts";
import { SANDBOX_TOOL_SPECS } from "../tools/sandbox-specs.ts";
import { standardSchema } from "../tools/schema.ts";
import { loadSkillRegistration } from "../tools/skills.ts";
import { RuthToolError } from "../tools/core.ts";
import { runPaths } from "./paths.ts";

const policy = { agents: ["ruth-cloud"], approval: "never" } as const;

/** Same visual tools as chat, targeting the persistent Cloud workspace. */
export const cloudVisualTools = {
  load_skill: loadSkillRegistration,
  get_page_context: registerTool({
    spec: {
      name: "get_page_context",
      ...getPageContextSpec,
      description:
        "Get the Cloud output's figure tokens, fonts, runtime kits, sourceRoot and themeFile. The server-written themeFile contains both production palettes, neutral series and matplotlib rcParams for plots and video frames. Cloud has no live reader appearance; default static exports to light unless the task requests another theme. HTML must support both themes.",
      outputSchema: standardSchema(
        Schema.Struct({ ...PageContextResult.fields, themeFile: Schema.String }),
      ),
    },
    policy,
    execute: Effect.fn("RuthCloud.visualContext")(function* (_input, ctx) {
      if (!ctx.runId)
        return yield* new RuthToolError({
          tool: "get_page_context",
          code: "invalid_input",
          message: "A Cloud run is required for visual context.",
          recoverable: false,
        });
      const appearance = ctx.page?.colorScheme ?? "light";
      const tokens = WIDGET_THEME_TOKENS[appearance];
      return {
        surface: "library" as const,
        platform: "web" as const,
        contentWidthPx: ctx.page?.contentWidthPx ?? 640,
        colorScheme: appearance,
        themeTokens: tokens,
        fonts: { body: tokens["--font-sans"], mono: tokens["--font-mono"] },
        runtime: VISUAL_RUNTIME,
        budgets: VISUAL_BUDGETS,
        existingVisuals: [],
        themeFile: `${runPaths(ctx.runId).runDir}/visual-theme.json`,
      };
    }),
  }),
  preview_widget: registerTool({
    spec: {
      ...SANDBOX_TOOL_SPECS.preview_widget,
      description:
        "Preview a self-contained HTML widget with the production CSP, theme tokens and bundled kits. Pass exactly one of html (512,000 bytes max) or path (an HTML file in the running Cloud workspace, 8 MiB max). Use the built path for large pages. Inspect the returned screenshot, interactions and errors before publishing with publish_output or publish_asset. Use appearance light/dark and width 390 for theme and phone checks.",
    },
    policy,
    execute: Effect.fn("RuthCloud.previewWidget")(function* (input, ctx) {
      const result = yield* (yield* WidgetPreview).preview(input, ctx);
      return { ...result, ...(result.ok && input.activity ? { activity: input.activity } : {}) };
    }),
  }),
};
