import { foldersResponse } from "~/server/libraryHttp";
import { runLibraryRoute } from "~/server/applicationRuntime";
export const runtime = "nodejs";
export const GET = (request: Request) => runLibraryRoute(foldersResponse(request));
export const POST = (request: Request) => runLibraryRoute(foldersResponse(request));
