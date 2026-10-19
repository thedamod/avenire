import { cloudGatewayTools, resolveRunTimeZone } from "@avenire/ruth-kit/cloud-tools";
import { makeGateway } from "@avenire/ruth-kit/gateway";

export const cloudRegistry = cloudGatewayTools;
export const cloudGatewayOptions = { resolveTimeZone: resolveRunTimeZone };
export const cloudGateway = makeGateway(cloudRegistry, cloudGatewayOptions);
