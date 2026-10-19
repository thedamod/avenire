import * as Effect from "effect/Effect";
import { cloudGateway as gateway } from "~/server/cloudTools";
import { readJsonBody } from "~/server/http";
import { runRoute } from "~/server/runtime";

export const runtime = "nodejs";
export const POST = async (request: Request, context: { params: Promise<{ name: string }> }) => {
  const { name } = await context.params;
  return runRoute(
    Effect.gen(function* () {
      const input = yield* readJsonBody(request);
      const result = yield* gateway.handleToolCall({
        authorization: request.headers.get("authorization"),
        name,
        input,
      });
      return Response.json(result.body, { status: result.status });
    }),
  );
};
