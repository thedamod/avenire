import { fileEventResponse } from "~/server/libraryHttp";
import { runLibraryRoute } from "~/server/applicationRuntime";
export const runtime = "nodejs";
export const POST = async (request: Request, context: { params: Promise<{ fileId: string }> }) =>
  runLibraryRoute(fileEventResponse(request, (await context.params).fileId));
