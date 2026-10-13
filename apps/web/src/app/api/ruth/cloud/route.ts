import { CloudRunEvents } from "@avenire/ai/cloud/events";
import { CloudTasks } from "@avenire/ai/scheduler";
import { CloudRunRequest } from "@avenire/contracts";
import { createUIMessageStreamResponse } from "ai";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpRequestError, readJsonBody } from "~/server/http";
import { runRoute } from "~/server/runtime";
import { requireUser } from "~/server/session";

export const runtime = "nodejs";

/** Starts a Cloud run (a one-off prompt, or an existing task now) and streams it like chat. */
export const POST = (request: Request) =>
  runRoute(
    Effect.gen(function* () {
      const userId = yield* requireUser(request);
      const body = yield* readJsonBody(request);
      const input = yield* Schema.decodeUnknownEffect(CloudRunRequest)(body).pipe(
        Effect.mapError(
          () => new HttpRequestError({ status: 400, message: "Invalid Cloud run request." }),
        ),
      );
      const tasks = yield* CloudTasks;
      // The worker is the only executor; this just enqueues and then tails the run's event log.
      const run =
        "taskId" in input
          ? yield* tasks.runNow(userId, input.taskId)
          : yield* tasks.runAdHoc(userId, input);
      const events = yield* CloudRunEvents;
      const stream = yield* events.stream(userId, run.id);
      return createUIMessageStreamResponse({ stream, headers: { "x-ruth-run-id": run.id } });
    }).pipe(
      Effect.catchTags({
        NotFound: () =>
          Effect.succeed(Response.json({ error: "Task not found." }, { status: 404 })),
        Conflict: (error) =>
          Effect.succeed(Response.json({ error: error.reason }, { status: 409 })),
      }),
    ),
  );
