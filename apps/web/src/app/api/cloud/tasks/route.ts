import { tasksResponse } from "~/server/domainHttp";
import { runCloudRoute } from "~/server/applicationRuntime";
export const runtime = "nodejs";
export const GET = (request: Request) => runCloudRoute(tasksResponse(request));
export const POST = (request: Request) => runCloudRoute(tasksResponse(request));
