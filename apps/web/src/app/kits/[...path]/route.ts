import { kitsResponse } from "~/server/kits";
import { runOutputRoute } from "~/server/outputRuntime";
export const runtime = "nodejs";
export const GET = async (request: Request, context: { params: Promise<{ path: string[] }> }) => {
  const { path } = await context.params;
  return runOutputRoute(kitsResponse(request, path));
};
