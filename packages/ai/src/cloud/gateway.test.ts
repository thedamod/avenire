import { CloudRunId, NotFound, Unauthorized } from "@avenire/contracts";
import { Analytics } from "@avenire/shared/observability";
import { expect, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { gatewayTool, makeGateway, toolManifest } from "./gateway.ts";
import { RunTokens } from "./run-tokens.ts";
import { standardSchema } from "../tools/schema.ts";
import { ctx, recordingAnalytics } from "../tools/test-support.ts";
import type { RuthKitServices } from "../tools/library.ts";

const runId = CloudRunId.make("run");
const tokens = RunTokens.of({
  mint: () => Effect.die("unused"),
  revokeRun: () => Effect.void,
  verify: (token) =>
    token === "valid" || token === "limited"
      ? Effect.succeed({
          userId: ctx.userId,
          runId,
          scopes: token === "valid" ? ["retrieval", "hydrate"] : ["retrieval"],
        })
      : Effect.fail(new Unauthorized({})),
});
let invoked = 0;
const echoSpec = {
  name: "cloud_echo",
  description: "Cloud test extension",
  inputSchema: standardSchema(Schema.Struct({ value: Schema.NonEmptyString })),
  outputSchema: standardSchema(Schema.Struct({ value: Schema.String })),
};
const gateway = makeGateway(
  {
    cloud_echo: gatewayTool({
      spec: echoSpec,
      policy: { agents: ["ruth-cloud"], approval: "never", scope: "hydrate" },
      execute: (input, agent) =>
        Effect.sync(() => {
          invoked++;
          expect(agent).toEqual({
            userId: ctx.userId,
            runId,
            agent: "ruth-cloud",
            fullAccess: false,
            timeZone: "America/Los_Angeles",
          });
          return { value: input.value };
        }),
    }),
    cloud_error: gatewayTool({
      spec: { ...echoSpec, name: "cloud_error" },
      policy: { agents: ["ruth-cloud"], approval: "never", scope: "hydrate" },
      execute: () => Effect.fail(new NotFound({ entity: "File", id: "missing" })),
    }),
    cloud_bad_output: gatewayTool({
      spec: { ...echoSpec, name: "cloud_bad_output" },
      policy: { agents: ["ruth-cloud"], approval: "never", scope: "hydrate" },
      execute: () => Effect.succeed({ value: 12 } as unknown as { value: string }),
    }),
  },
  { resolveTimeZone: () => Effect.succeed("America/Los_Angeles") },
);
const services = Context.make(Analytics, recordingAnalytics()) as Context.Context<RuthKitServices>;
const call = (authorization: string | null, name: string, input: unknown) =>
  gateway
    .handleToolCall({ authorization, name, input })
    .pipe(Effect.provide(services), Effect.provideService(RunTokens, tokens));
for (const authorization of [
  null,
  "",
  "Basic valid",
  "Bearer invalid",
  "Bearer revoked",
  "Bearer expired",
])
  it.effect(`rejects credentials ${authorization}`, () =>
    Effect.gen(function* () {
      expect((yield* call(authorization, "cloud_echo", { value: "hello" })).status).toBe(401);
    }),
  );
for (const name of [
  "write_file",
  "move_file",
  "rename_file",
  "archive_file",
  "render_widget",
  "unknown",
  "toString",
  "__proto__",
])
  it.effect(`rejects disallowed tool ${name}`, () =>
    Effect.gen(function* () {
      expect((yield* call("Bearer valid", name, {})).status).toBe(403);
    }),
  );
it.effect("rejects a cloud tool outside the token scopes", () =>
  Effect.gen(function* () {
    expect((yield* call("Bearer limited", "cloud_echo", { value: "hi" })).status).toBe(403);
  }),
);
it.effect("bad input returns a readable 400 before execution", () =>
  Effect.gen(function* () {
    const before = invoked;
    const response = yield* call("Bearer valid", "cloud_echo", { value: 1 });
    expect(response).toMatchObject({
      status: 400,
      body: { error: expect.stringContaining("value") },
    });
    expect(invoked).toBe(before);
  }),
);
it.effect("cloud extension executes with scoped context and encodes the result", () =>
  Effect.gen(function* () {
    expect(yield* call("Bearer valid", "cloud_echo", { value: "hello" })).toEqual({
      status: 200,
      body: { value: "hello" },
    });
  }),
);
it.effect("domain errors return model-safe 422", () =>
  Effect.gen(function* () {
    expect(yield* call("Bearer valid", "cloud_error", { value: "hi" })).toEqual({
      status: 422,
      body: {
        error: { code: "not_found", message: "File missing was not found", recoverable: true },
      },
    });
  }),
);
it.effect("invalid implementation output is caught at the encoding boundary", () =>
  Effect.gen(function* () {
    expect(yield* call("Bearer valid", "cloud_bad_output", { value: "hi" })).toMatchObject({
      status: 422,
      body: { error: { code: "failed" } },
    });
  }),
);
it("manifest has only cloud tools and derives JSON schemas including extra tools", () => {
  expect(
    toolManifest()
      .map((entry) => entry.name)
      .sort(),
  ).toEqual(["find_files", "list_files", "read_file", "search_materials"]);
  const entry = gateway.toolManifest().find((entry) => entry.name === "cloud_echo");
  expect(entry?.inputSchema).toMatchObject({
    type: "object",
    properties: { value: { type: "string" } },
    required: ["value"],
  });
});

it.effect("extensions cannot override built-in Ruth-only policies", () => {
  const attempted = makeGateway({
    write_file: gatewayTool({
      spec: { ...echoSpec, name: "write_file" },
      policy: { agents: ["ruth-cloud"], approval: "never", scope: "hydrate" },
      execute: () => Effect.die("must not run"),
    }),
  });
  return Effect.gen(function* () {
    expect(
      (yield* attempted.handleToolCall({
        authorization: "Bearer valid",
        name: "write_file",
        input: { value: "hi" },
      })).status,
    ).toBe(403);
    expect(attempted.toolManifest().map((entry) => entry.name)).not.toContain("write_file");
  }).pipe(Effect.provide(services), Effect.provideService(RunTokens, tokens));
});
