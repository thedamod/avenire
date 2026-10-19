import { cancelUploadResponse, putUploadResponse } from "~/server/sourceUploadHttp";
import { runUploadRoute } from "~/server/uploadRuntime";
export const runtime = "nodejs";
type RouteContext = { params: Promise<{ uploadId: string }> };
export const PUT = async (request: Request, context: RouteContext) =>
  runUploadRoute(putUploadResponse(request, (await context.params).uploadId));
export const DELETE = async (request: Request, context: RouteContext) =>
  runUploadRoute(cancelUploadResponse(request, (await context.params).uploadId));
