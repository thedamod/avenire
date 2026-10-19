import { ingestionStreamResponse } from "~/server/libraryHttp";
import { runLibraryRoute } from "~/server/applicationRuntime";
export const runtime = "nodejs";
export const GET = (request: Request) => runLibraryRoute(ingestionStreamResponse(request));
