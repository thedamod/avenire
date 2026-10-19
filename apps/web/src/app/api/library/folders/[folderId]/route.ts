import { renameFolderResponse } from "~/server/libraryHttp";
import { runLibraryRoute } from "~/server/applicationRuntime";
export const runtime = "nodejs";
export const PATCH = async (request: Request, context: { params: Promise<{ folderId: string }> }) =>
  runLibraryRoute(renameFolderResponse(request, (await context.params).folderId));
