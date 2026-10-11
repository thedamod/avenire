import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { type AgentContext, type TaggedToolError, runTool } from "../tools/core.ts";
import { RunTokens, type VerifiedRunToken } from "./run-tokens.ts";
import { RUTH_TOOL_POLICY, RUTH_TOOL_SPECS, type ToolPolicy } from "../tools/specs.ts";
import { ruthKitTools, type RuthKitServices } from "../tools/library.ts";
import { standardSchema } from "../tools/schema.ts";

export interface GatewayTool<R = RuthKitServices> {
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
export type GatewayResponse = { readonly status: number; readonly body: unknown };
export interface ToolCallRequest {
  readonly authorization: string | null;
  readonly name: string;
  readonly input: unknown;
}

/** Preserve each schema/implementation pair before erasing types for HTTP dispatch. */
export const gatewayTool = <I, O, R>(definition: {
  readonly spec: {
    readonly name: string;
    readonly description: string;
    readonly inputSchema: Schema.Codec<I, unknown>;
    readonly outputSchema: Schema.Codec<O, unknown>;
  };
  readonly policy: ToolPolicy;
  readonly execute: (input: I, ctx: AgentContext) => Effect.Effect<O, TaggedToolError, R>;
}): GatewayTool<R> => ({ ...definition, execute: definition.execute as GatewayTool<R>["execute"] });

const baseRegistry: Record<string, GatewayTool> = Object.fromEntries(
  Object.keys(RUTH_TOOL_SPECS).map((key) => {
    const name = key as keyof typeof RUTH_TOOL_SPECS;
    return [
      name,
      {
        spec: RUTH_TOOL_SPECS[name],
        policy: RUTH_TOOL_POLICY[name],
        execute: ruthKitTools[name] as GatewayTool["execute"],
      },
    ];
  }),
);

/** Cloud extensions cannot replace built-in schemas or policies; dispatch retains auth and scope enforcement. */
export const makeGateway = <R = never, T = never>(
  registry: Readonly<Record<string, GatewayTool<R>>> = {},
  options: {
    readonly resolveTimeZone?: (run: VerifiedRunToken) => Effect.Effect<string, never, T>;
  } = {},
) => {
  const all: Readonly<Record<string, GatewayTool<R | RuthKitServices>>> = {
    ...registry,
    ...baseRegistry,
  };
  const handleToolCall = Effect.fn("RuthGateway.handleToolCall")(
    (
      request: ToolCallRequest,
    ): Effect.Effect<GatewayResponse, never, R | T | RuthKitServices | RunTokens> =>
      Effect.gen(function* () {
        const match = /^Bearer\s+(\S+)$/i.exec(request.authorization ?? "");
        if (!match)
          return { status: 401, body: { error: "A valid Bearer run token is required." } };
        const tokens = yield* RunTokens;
        const verified = yield* tokens.verify(match[1]!).pipe(Effect.result);
        if (verified._tag === "Failure")
          return { status: 401, body: { error: "The run token is invalid, revoked, or expired." } };
        const entry = Object.hasOwn(all, request.name) ? all[request.name] : undefined;
        if (
          !entry ||
          !entry.policy.agents.includes("ruth-cloud") ||
          entry.policy.scope === undefined ||
          !verified.success.scopes.includes(entry.policy.scope)
        )
          return { status: 403, body: { error: "This tool is not allowed by the run token." } };
        const decoded = yield* Schema.decodeUnknownEffect(entry.spec.inputSchema)(
          request.input,
        ).pipe(Effect.result);
        if (decoded._tag === "Failure")
          return { status: 400, body: { error: decoded.failure.message } };
        const run = verified.success;
        const timeZone =
          options.resolveTimeZone === undefined ? "UTC" : yield* options.resolveTimeZone(run);
        const ctx: AgentContext = {
          agent: "ruth-cloud",
          userId: run.userId,
          runId: run.runId,
          fullAccess: false,
          timeZone,
        };
        return yield* runTool(
          request.name,
          ctx,
          entry
            .execute(decoded.success, ctx)
            .pipe(Effect.flatMap((output) => Schema.encodeEffect(entry.spec.outputSchema)(output))),
        ).pipe(
          Effect.map((body): GatewayResponse => ({ status: 200, body })),
          Effect.catchTag("RuthToolError", (error) =>
            Effect.succeed({
              status: 422,
              body: {
                error: { code: error.code, message: error.message, recoverable: error.recoverable },
              },
            }),
          ),
        );
      }),
  );
  const toolManifest = () =>
    Object.values(all)
      .filter((entry) => entry.policy.agents.includes("ruth-cloud"))
      .map((entry) => ({
        name: entry.spec.name,
        description: entry.spec.description,
        inputSchema: standardSchema(entry.spec.inputSchema)["~standard"].jsonSchema.input({
          target: "draft-07",
        }),
      }));
  return { handleToolCall, toolManifest };
};
const defaultGateway = makeGateway();
export const handleToolCall = defaultGateway.handleToolCall;
export const toolManifest = defaultGateway.toolManifest;
