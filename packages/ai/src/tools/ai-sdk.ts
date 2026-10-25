import type { ImageTransport } from "./images.ts";
import { tool, type ToolSet } from "ai";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { type AgentContext, RuthToolError, runTool } from "./core.ts";
import type { ToolRegistration } from "./registration.ts";
import { standardSchema, standardObjectSchema } from "./schema.ts";
import { RUTH_TOOL_POLICY, RUTH_TOOL_SPECS, type RuthToolName } from "./specs.ts";
import { ruthKitTools, type RuthKitServices, type RuthToolImplementations } from "./library.ts";

/** A paired spec/implementation extends the adapter; existing implementations can be overridden for tests. */
export type AiSdkExtraTools<R = never> = Partial<RuthToolImplementations> &
  Readonly<Record<string, ToolRegistration<R> | RuthToolImplementations[RuthToolName] | undefined>>;

/** Existing policies remain authoritative; new registrations carry their own agent/approval policy. */
export const toAiSdkTools = <R = never>(
  names: ReadonlyArray<string>,
  ctx: AgentContext,
  services: Context.Context<RuthKitServices | R>,
  extra: AiSdkExtraTools<R> = {},
  images?: ImageTransport,
) => {
  const tools: ToolSet = Object.create(null);
  const toolApproval: Record<string, "approved"> = Object.create(null);
  for (const name of names) {
    const override = Object.hasOwn(extra, name) ? extra[name] : undefined;
    let registration: ToolRegistration<RuthKitServices | R>;
    if (Object.hasOwn(RUTH_TOOL_SPECS, name)) {
      const builtIn = name as RuthToolName;
      // Runtime registry iteration erases the correlation; specs and implementations share a typed key map.
      registration = {
        spec: RUTH_TOOL_SPECS[builtIn],
        policy: RUTH_TOOL_POLICY[builtIn],
        execute: (typeof override === "function"
          ? override
          : (override?.execute ??
            ruthKitTools[builtIn])) as ToolRegistration<RuthKitServices>["execute"],
      };
    } else if (override !== undefined && typeof override !== "function") registration = override;
    else continue;
    const { policy, spec, execute } = registration;
    if (!policy.agents.includes(ctx.agent)) continue;
    tools[name] = tool({
      description: spec.description,
      inputSchema: standardObjectSchema(spec.inputSchema),
      outputSchema: standardSchema(spec.outputSchema),
      needsApproval: policy.approval === "unless-full-access" && !ctx.fullAccess,
      ...(images ? { toModelOutput: images.toModelOutput } : {}),
      execute: async (input, { abortSignal, toolCallId }) => {
        const callContext = { ...ctx, toolCallId };
        const result = await Effect.runPromiseWith(services)(
          runTool(
            name,
            callContext,
            Schema.decodeUnknownEffect(spec.inputSchema)(input).pipe(
              Effect.mapError(
                () =>
                  new RuthToolError({
                    tool: name,
                    code: "invalid_input",
                    message: "Arguments do not match this tool schema.",
                    recoverable: true,
                  }),
              ),
              Effect.flatMap((decoded) => execute(decoded, callContext)),
            ),
          ),
          {
            signal: abortSignal,
          },
        );
        images?.attach(result);
        return result;
      },
    });
    // Under Full access gated tools still pass through approval, as approved, so they show in the stream.
    if (ctx.fullAccess && policy.approval === "unless-full-access") toolApproval[name] = "approved";
  }
  return { tools, toolApproval };
};
