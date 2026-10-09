import { makeGateway } from "@avenire/ruth-kit/gateway";
import { RunTokens } from "@avenire/ruth-kit/run-tokens";
import * as Effect from "effect/Effect";
import { cloudRegistry } from "~/server/cloudTools";
import { runRoute } from "~/server/runtime";

export const runtime = "nodejs";
const gateway = makeGateway(cloudRegistry);
export const GET = (request: Request) =>
  runRoute(
    Effect.gen(function* () {
      const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
      if (!match)
        return Response.json({ error: "A valid Bearer run token is required." }, { status: 401 });
      const tokens = yield* RunTokens;
      yield* tokens.verify(match[1]!);
      return Response.json(gateway.toolManifest());
    }).pipe(
      Effect.catchTag("Unauthorized", () =>
        Effect.succeed(
          Response.json(
            { error: "The run token is invalid, revoked, or expired." },
            { status: 401 },
          ),
        ),
      ),
    ),
  );
