import { taskResponse } from "~/server/domainHttp";
import { runCloudRoute } from "~/server/applicationRuntime";
export const runtime = "nodejs";
export const PATCH = async (request: Request, context: { params: Promise<{ id: string }> }) =>
  runCloudRoute(taskResponse(request, (await context.params).id));
export const DELETE = async (request: Request, context: { params: Promise<{ id: string }> }) =>
  runCloudRoute(taskResponse(request, (await context.params).id));
