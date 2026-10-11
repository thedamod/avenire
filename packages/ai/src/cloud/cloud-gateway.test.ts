import { Unauthorized } from "@avenire/contracts";
import { Analytics } from "@avenire/shared/observability";
import { expect, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { toAiSdkTools } from "../tools/ai-sdk.ts";
import { cloudCtx } from "./cloud-test-support.ts";
import { CLOUD_TOOL_SPECS } from "../tools/cloud-specs.ts";
import { cloudGatewayTools, type CloudToolServices } from "./tools.ts";
import { makeGateway } from "./gateway.ts";
import { RunTokens } from "./run-tokens.ts";
import { recordingAnalytics } from "../tools/test-support.ts";
import type { RuthKitServices } from "../tools/library.ts";

it.effect("hydrate_files rejects a token lacking hydrate scope before executing", () => {
  const tokens = RunTokens.of({
    mint: () => Effect.die("unused"),
    revokeRun: () => Effect.void,
    verify: (token) =>
      token === "limited"
        ? Effect.succeed({ userId: cloudCtx.userId, runId: cloudCtx.runId!, scopes: ["retrieval"] })
        : Effect.fail(new Unauthorized({})),
  });
  // No CloudBoxes/Database/Storage providers: a scope failure must never start execution.
  const services = Context.make(RunTokens, tokens) as Context.Context<
    RunTokens | RuthKitServices | CloudToolServices
  >;
  return Effect.gen(function* () {
    expect(
      (yield* makeGateway(cloudGatewayTools).handleToolCall({
        authorization: "Bearer limited",
        name: "hydrate_files",
        input: { selector: {} },
      })).status,
    ).toBe(403);
  }).pipe(Effect.provide(services));
});
it("chat can never receive Cloud tools even when explicitly registered", () => {
  const services = Context.make(Analytics, recordingAnalytics()) as Context.Context<
    RuthKitServices | CloudToolServices
  >;
  expect(
    toAiSdkTools<CloudToolServices>(
      Object.keys(cloudGatewayTools),
      { ...cloudCtx, agent: "ruth", fullAccess: true },
      services,
      cloudGatewayTools,
    ).tools,
  ).toEqual({});
  expect(
    makeGateway(cloudGatewayTools)
      .toolManifest()
      .map((tool) => tool.name),
  ).toEqual(expect.arrayContaining(["hydrate_files", "publish_output", "publish_report"]));
});
it.effect("cloud schemas enforce hydration, report and artifact caps", () =>
  Effect.gen(function* () {
    for (const input of [
      { selector: {}, maxFiles: 201 },
      { selector: {}, maxFiles: 0 },
      { selector: {}, maxBytes: 1024 ** 3 + 1 },
      { selector: {}, maxBytes: 0 },
      { selector: {}, maxFiles: 1.2 },
    ])
      expect(
        (yield* Schema.decodeUnknownEffect(CLOUD_TOOL_SPECS.hydrate_files.inputSchema)(input).pipe(
          Effect.result,
        ))._tag,
      ).toBe("Failure");
    for (const input of [
      { markdown: "x".repeat(100001) },
      { markdown: "ok", assets: Array(21).fill("report.md") },
    ])
      expect(
        (yield* Schema.decodeUnknownEffect(CLOUD_TOOL_SPECS.publish_report.inputSchema)(input).pipe(
          Effect.result,
        ))._tag,
      ).toBe("Failure");
  }),
);
