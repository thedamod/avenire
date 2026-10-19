import { searchResponse } from "~/server/domainHttp";
import { runSearchRoute } from "~/server/applicationRuntime";
export const runtime = "nodejs";
export const POST = (request: Request) => runSearchRoute(searchResponse(request));
