import { cloudGatewayTools, resolveRunTimeZone } from "@avenire/ai/cloud/tools";
import { makeGateway } from "@avenire/ai/cloud/gateway";

export const cloudRegistry = cloudGatewayTools;
export const cloudGatewayOptions = { resolveTimeZone: resolveRunTimeZone };
export const cloudGateway = makeGateway(cloudRegistry, cloudGatewayOptions);
