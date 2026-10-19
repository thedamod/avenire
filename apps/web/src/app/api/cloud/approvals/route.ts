import { approvalsResponse } from "~/server/domainHttp";
import { runCloudRoute } from "~/server/applicationRuntime";
export const runtime = "nodejs";
export const GET = (request: Request) => runCloudRoute(approvalsResponse(request));
