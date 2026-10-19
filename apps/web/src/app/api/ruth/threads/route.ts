import { threadsResponse } from "~/server/domainHttp";
import { runThreadRoute } from "~/server/applicationRuntime";
export const runtime = "nodejs";
export const GET = (request: Request) => runThreadRoute(threadsResponse(request));
export const POST = (request: Request) => runThreadRoute(threadsResponse(request));
