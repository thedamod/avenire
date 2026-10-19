import { cancelRunResponse } from "~/server/domainHttp";
import { runCloudRoute } from "~/server/applicationRuntime";
export const runtime = "nodejs";
export const POST = async (request: Request, context: { params: Promise<{ id: string }> }) =>
  runCloudRoute(cancelRunResponse(request, (await context.params).id));
