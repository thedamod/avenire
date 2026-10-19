import { ChatSandboxes } from "@avenire/cloud/chat-sandbox";
import { WIDGET_THEME_TOKENS } from "@avenire/ui/tokens";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Semaphore from "effect/Semaphore";
import { wrapWidget, resolveWidgetSource } from "../outputs/widgets.ts";
import { type AgentContext, RuthToolError, toToolError } from "./core.ts";
import { PreviewResult } from "./preview/report.ts";
import { createLocalRunner, type PreviewRunner } from "./preview/runner.ts";
export { PreviewResult } from "./preview/report.ts";

export type PreviewInput = import("@avenire/contracts").WidgetSource & {
  readonly width?: number;
  readonly appearance?: "light" | "dark";
};
export class WidgetPreview extends Context.Service<
  WidgetPreview,
  {
    readonly preview: (
      input: PreviewInput,
      ctx: AgentContext,
    ) => Effect.Effect<typeof PreviewResult.Type, RuthToolError>;
  }
>()("avenire/ai/WidgetPreview") {}

// Machine-local pool shared by all service instances/threads in this server process.
const pool = Semaphore.makeUnsafe(2);
export const makeWidgetPreview = Effect.fn("WidgetPreview.make")(function* (
  runner?: PreviewRunner,
) {
  const sandboxes = yield* ChatSandboxes;
  const environment = yield* Config.all({
    PATH: Config.String("PATH").pipe(Config.withDefault("/usr/local/bin:/usr/bin:/bin")),
    HOME: Config.String("HOME"),
    XDG_RUNTIME_DIR: Config.String("XDG_RUNTIME_DIR").pipe(Config.withDefault("")),
  });
  const run = runner ?? createLocalRunner(environment);
  return WidgetPreview.of({
    preview: (input, ctx) =>
      Effect.gen(function* () {
        const html = yield* resolveWidgetSource(ctx, input).pipe(
          Effect.provideService(ChatSandboxes, sandboxes),
        );
        const width = Math.max(
          240,
          Math.min(1600, Math.round(input.width ?? ctx.page?.contentWidthPx ?? 640)),
        );
        const appearance = input.appearance ?? ctx.page?.colorScheme ?? "light";
        const tokens = {
          ...(ctx.page?.colorScheme === appearance ? ctx.page.themeTokens : {}),
          ...WIDGET_THEME_TOKENS[appearance],
        };
        const result = yield* Effect.acquireUseRelease(
          Effect.sync(() => {
            const controller = new AbortController();
            const promise = run(
              {
                width,
                appearance,
                tokens,
                document: (origin) =>
                  Effect.runPromise(
                    wrapWidget(ctx, { html, title: "Widget preview" }, origin, appearance),
                  ),
              },
              controller.signal,
            );
            return { controller, promise };
          }),
          (task) =>
            Effect.tryPromise({
              try: () => task.promise,
              catch: (cause) =>
                new RuthToolError({
                  tool: "preview_widget",
                  code: "failed",
                  message: cause instanceof Error ? cause.message : String(cause),
                  recoverable: true,
                }),
            }),
          (task) =>
            Effect.promise(async () => {
              task.controller.abort();
              // Keep the pool permit until interrupted browser cleanup finishes.
              await task.promise.catch(() => undefined);
            }),
        );
        return result;
      }).pipe(
        pool.withPermits(1),
        Effect.timeout("60 seconds"),
        Effect.catchCause((cause) => toToolError("preview_widget", cause)),
      ),
  });
});
export const WidgetPreviewLive = Layer.effect(WidgetPreview, makeWidgetPreview());
