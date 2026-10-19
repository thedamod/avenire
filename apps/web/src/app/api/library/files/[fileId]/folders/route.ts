import { placementResponse } from "~/server/libraryHttp";
import { runLibraryRoute } from "~/server/applicationRuntime";
export const runtime = "nodejs";
export const PUT = async (request: Request, context: { params: Promise<{ fileId: string }> }) =>
  runLibraryRoute(placementResponse(request, (await context.params).fileId));
