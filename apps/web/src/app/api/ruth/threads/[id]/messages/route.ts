import { messagesResponse } from "~/server/domainHttp";
import { runThreadRoute } from "~/server/applicationRuntime";
export const runtime = "nodejs";
export const GET = async (request: Request, context: { params: Promise<{ id: string }> }) =>
  runThreadRoute(messagesResponse(request, (await context.params).id));
