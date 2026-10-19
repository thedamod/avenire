import { runsResponse } from "~/server/domainHttp";
import { runCloudRoute } from "~/server/applicationRuntime";
export const runtime = "nodejs";
export const GET = (request: Request) => runCloudRoute(runsResponse(request));
