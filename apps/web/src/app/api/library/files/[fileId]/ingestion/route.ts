import { ingestionPausedResponse } from "~/server/libraryHttp";
import { runLibraryRoute } from "~/server/applicationRuntime";
export const runtime = "nodejs";
export const PATCH = async (request: Request, context: { params: Promise<{ fileId: string }> }) =>
  runLibraryRoute(ingestionPausedResponse(request, (await context.params).fileId));
