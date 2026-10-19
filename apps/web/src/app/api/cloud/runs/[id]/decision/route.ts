import { runDecisionResponse } from "~/server/domainHttp";
import { runCloudRoute } from "~/server/applicationRuntime";
export const runtime = "nodejs";
export const POST = async (request: Request, context: { params: Promise<{ id: string }> }) =>
  runCloudRoute(runDecisionResponse(request, (await context.params).id));
