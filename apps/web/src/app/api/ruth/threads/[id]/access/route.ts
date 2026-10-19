import { accessResponse } from "~/server/domainHttp";
import { runThreadRoute } from "~/server/applicationRuntime";
export const runtime = "nodejs";
export const PATCH = async (request: Request, context: { params: Promise<{ id: string }> }) =>
  runThreadRoute(accessResponse(request, (await context.params).id));
