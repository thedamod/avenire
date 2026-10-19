import { Ruth } from "@avenire/ai/ruth";
import { RuthChatRequest } from "@avenire/contracts";
import { createUIMessageStreamResponse } from "ai";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpRequestError, readJsonBody } from "~/server/http";
import { runRoute } from "~/server/runtime";
import { assertMutationOrigin, requireUser } from "~/server/session";

export const runtime = "nodejs";
export const POST = (request: Request) =>
  runRoute(
    Effect.gen(function* () {
      yield* assertMutationOrigin(request);
      const userId = yield* requireUser(request);
      const body = yield* readJsonBody(request);
      const input = yield* Schema.decodeUnknownEffect(RuthChatRequest)(body).pipe(
        Effect.mapError(
          () => new HttpRequestError({ status: 400, message: "Invalid chat request." }),
        ),
      );
      const ruth = yield* Ruth;
      const stream = yield* ruth.chat({ ...input, userId });
      return createUIMessageStreamResponse({ stream });
    }).pipe(
      Effect.catchTags({
        NotFound: () =>
          Effect.succeed(Response.json({ error: "Thread not found." }, { status: 404 })),
        RuthError: (error) =>
          Effect.succeed(
            Response.json({ error: "The chat request could not be completed." }, { status: 400 }),
          ),
      }),
    ),
  );
