import { assetResponse } from "~/server/domainHttp";
import { runCloudRoute } from "~/server/applicationRuntime";
export const runtime = "nodejs";
export const GET = async (request: Request, context: { params: Promise<{ id: string }> }) =>
  runCloudRoute(assetResponse(request, (await context.params).id));
