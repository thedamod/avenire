import { Ruth } from "@avenire/ai/ruth";
import { RuthChatRequest } from "@avenire/contracts";
import { createUIMessageStreamResponse } from "ai";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpRequestError, readJsonBody } from "~/server/http";
import { provideScreenSharing } from "~/server/applicationRuntime";
import { ScreenSharing } from "~/server/settings";
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
      // A renderer may still hold an earlier image when sharing is revoked elsewhere.
      // Never forward that retained context to an AI service after revocation.
      if (input.screenContext) {
        const enabled = yield* provideScreenSharing(
          Effect.flatMap(ScreenSharing, (service) => service.enabled({ id: userId })),
        );
        if (!enabled)
          return yield* new HttpRequestError({
            status: 403,
            message: "Screen sharing is off. Enable Share screen with Ava in Settings → Capture.",
          });
      }
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
