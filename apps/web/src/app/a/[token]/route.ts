import * as Effect from "effect/Effect";
import { assetResponse } from "~/server/assetRoutes";
import { runOutputRoute } from "~/server/outputRuntime";
export const runtime = "nodejs";
export const GET = async (request: Request, context: { params: Promise<{ token: string }> }) => {
  const { token } = await context.params;
  return runOutputRoute(
    assetResponse(request, token).pipe(
      Effect.catchTag("ObjectNotFound", () => Effect.succeed(new Response(null, { status: 404 }))),
    ),
  );
};
