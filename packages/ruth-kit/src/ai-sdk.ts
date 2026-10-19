import { tool, type ToolSet } from "ai";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";

import { type AgentContext, runTool } from "./core.ts";
import type { GatewayTool } from "./gateway.ts";
import { standardSchema } from "./schema.ts";
import { RUTH_TOOL_POLICY, RUTH_TOOL_SPECS, type RuthToolName } from "./specs.ts";
import { ruthKitTools, type RuthKitServices, type RuthToolImplementations } from "./tools.ts";

/** A paired spec/implementation extends the adapter; existing implementations can be overridden for tests. */
export type AiSdkExtraTools<R = never> = Partial<RuthToolImplementations> &
  Readonly<Record<string, GatewayTool<R> | RuthToolImplementations[RuthToolName] | undefined>>;

/** Existing policies remain authoritative; new registrations carry their own agent/approval policy. */
export const toAiSdkTools = <R = never>(
  names: ReadonlyArray<string>,
  ctx: AgentContext,
  services: Context.Context<RuthKitServices | R>,
  extra: AiSdkExtraTools<R> = {},
) => {
  const tools: ToolSet = Object.create(null);
  const toolApproval: Record<string, "approved"> = Object.create(null);
  for (const name of names) {
    const override = Object.hasOwn(extra, name) ? extra[name] : undefined;
    let registration: GatewayTool<RuthKitServices | R>;
    if (Object.hasOwn(RUTH_TOOL_SPECS, name)) {
      const builtIn = name as RuthToolName;
      // Runtime registry iteration erases the correlation; specs and implementations share a typed key map.
      registration = {
        spec: RUTH_TOOL_SPECS[builtIn],
        policy: RUTH_TOOL_POLICY[builtIn],
        execute: (typeof override === "function"
          ? override
          : ruthKitTools[builtIn]) as GatewayTool<RuthKitServices>["execute"],
      };
    } else if (override !== undefined && typeof override !== "function") registration = override;
    else continue;
    const { policy, spec, execute } = registration;
    if (!policy.agents.includes(ctx.agent)) continue;
    tools[name] = tool({
      description: spec.description,
      inputSchema: standardSchema(spec.inputSchema),
      outputSchema: standardSchema(spec.outputSchema),
      needsApproval: policy.approval === "unless-full-access" && !ctx.fullAccess,
      execute: (input, { abortSignal }) =>
        Effect.runPromiseWith(services)(runTool(name, ctx, execute(input, ctx)), {
          signal: abortSignal,
        }),
    });
    // Under Full access gated tools still pass through approval, as approved, so they show in the stream.
    if (ctx.fullAccess && policy.approval === "unless-full-access") toolApproval[name] = "approved";
  }
  return { tools, toolApproval };
};
