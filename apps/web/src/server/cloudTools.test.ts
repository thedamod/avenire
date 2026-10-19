import { expect, it } from "@effect/vitest";
import { cloudGatewayTools, resolveRunTimeZone } from "@avenire/ruth-kit/cloud-tools";
import { cloudGateway, cloudGatewayOptions, cloudRegistry } from "./cloudTools.ts";

it("both gateway routes use the Cloud registry and run time zone option", () => {
  expect(cloudRegistry).toBe(cloudGatewayTools);
  expect(cloudGatewayOptions.resolveTimeZone).toBe(resolveRunTimeZone);
  expect(cloudGateway.toolManifest().map((tool) => tool.name)).toEqual(
    expect.arrayContaining(["hydrate_files", "publish_output", "publish_report"]),
  );
});
