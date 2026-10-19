import { createUploadResponse } from "~/server/sourceUploadHttp";
import { runUploadRoute } from "~/server/uploadRuntime";
export const runtime = "nodejs";
export const POST = (request: Request) => runUploadRoute(createUploadResponse(request));
