import { CloudRunEvents } from "@avenire/ai/cloud/events";
import { CloudRunId } from "@avenire/contracts";
import { createUIMessageStreamResponse } from "ai";
import * as Effect from "effect/Effect";
import { HttpRequestError } from "~/server/http";
import { runRoute } from "~/server/runtime";
import { requireUser } from "~/server/session";

export const runtime = "nodejs";

/**
 * Replays a run's UI message chunks from `?from=<seq>` (default 0), then tails until its terminal
 * event. Chunks map one-to-one onto sequence numbers, so `useChat` resume works after a disconnect.
 */
export const GET = (request: Request, context: { params: Promise<{ runId: string }> }) =>
  runRoute(
    Effect.gen(function* () {
      const userId = yield* requireUser(request);
      const { runId } = yield* Effect.promise(() => context.params);
      const from = Number(new URL(request.url).searchParams.get("from") ?? 0);
      if (!Number.isSafeInteger(from) || from < 0)
        return yield* new HttpRequestError({
          status: 400,
          message: "from must be a sequence number.",
        });
      const events = yield* CloudRunEvents;
      const stream = yield* events.stream(userId, CloudRunId.make(runId), from);
      return createUIMessageStreamResponse({ stream });
    }).pipe(
      Effect.catchTag("NotFound", () =>
        Effect.succeed(Response.json({ error: "Run not found." }, { status: 404 })),
      ),
    ),
  );
