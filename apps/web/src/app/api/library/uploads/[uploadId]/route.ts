import {
  cancelUploadResponse,
  uploadStatusResponse,
  putUploadResponse,
  completeUploadResponse,
} from "~/server/sourceUploadHttp";
import { runUploadRoute } from "~/server/uploadRuntime";
export const runtime = "nodejs";
type RouteContext = { params: Promise<{ uploadId: string }> };
export const PUT = async (request: Request, context: RouteContext) =>
  runUploadRoute(putUploadResponse(request, (await context.params).uploadId));
export const DELETE = async (request: Request, context: RouteContext) =>
  runUploadRoute(cancelUploadResponse(request, (await context.params).uploadId));

export const POST = async (request: Request, context: RouteContext) =>
  runUploadRoute(completeUploadResponse(request, (await context.params).uploadId));

export const GET = async (request: Request, context: RouteContext) =>
  runUploadRoute(uploadStatusResponse(request, (await context.params).uploadId));
