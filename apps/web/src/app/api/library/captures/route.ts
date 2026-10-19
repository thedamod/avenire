import { captureResponse } from "~/server/libraryHttp";
import { runLibraryRoute } from "~/server/applicationRuntime";
export const runtime = "nodejs";
export const POST = (request: Request) => runLibraryRoute(captureResponse(request));
