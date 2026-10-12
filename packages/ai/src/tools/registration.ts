import type * as Effect from "effect/Effect";
import type * as Schema from "effect/Schema";
import type { AgentContext, TaggedToolError } from "./core.ts";
import type { ToolPolicy } from "./specs.ts";
import type { RuthKitServices } from "./library.ts";

export interface ToolRegistration<R = RuthKitServices> {
  readonly spec: {
    readonly name: string;
    readonly description: string;
    readonly inputSchema: Schema.Codec<unknown, unknown>;
    readonly outputSchema: Schema.Codec<unknown, unknown>;
  };
  readonly policy: ToolPolicy;
  readonly execute: (
    input: unknown,
    ctx: AgentContext,
  ) => Effect.Effect<unknown, TaggedToolError, R>;
}
export const registerTool = <I, O, R>(definition: {
  readonly spec: {
    readonly name: string;
    readonly description: string;
    readonly inputSchema: Schema.Codec<I, unknown>;
    readonly outputSchema: Schema.Codec<O, unknown>;
  };
  readonly policy: ToolPolicy;
  readonly execute: (input: I, ctx: AgentContext) => Effect.Effect<O, TaggedToolError, R>;
}): ToolRegistration<R> => ({
  ...definition,
  execute: definition.execute as ToolRegistration<R>["execute"],
});
