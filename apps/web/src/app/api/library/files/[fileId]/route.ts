import { fileResponse } from "~/server/libraryHttp";
import { runLibraryRoute } from "~/server/applicationRuntime";
export const runtime = "nodejs";
export const GET = async (request: Request, context: { params: Promise<{ fileId: string }> }) =>
  runLibraryRoute(fileResponse(request, (await context.params).fileId));
