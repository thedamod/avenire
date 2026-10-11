import { ArtifactStore, artifactMediaType } from "@avenire/ai/outputs/artifacts";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { attachmentDisposition } from "~/server/http";
import { runRoute } from "~/server/runtime";

export const runtime = "nodejs";
export const GET = async (_request: Request, context: { params: Promise<{ token: string }> }) => {
  const { token } = await context.params;
  return runRoute(
    Effect.gen(function* () {
      const store = yield* ArtifactStore;
      const resolved = yield* store.resolve(token);
      if (Option.isNone(resolved)) return new Response(null, { status: 404 });
      const artifact = resolved.value;
      const bytes = yield* store.load(artifact.key);
      const secondsLeft = Math.max(
        0,
        Math.floor((Date.parse(artifact.expiresAt) - (yield* Clock.currentTimeMillis)) / 1000),
      );
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        }),
        {
          headers: {
            "Content-Type": artifactMediaType(artifact.name),
            "Content-Disposition": attachmentDisposition(artifact.name),
            "Content-Security-Policy": "sandbox",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": `private, max-age=${secondsLeft}`,
          },
        },
      );
    }).pipe(
      Effect.catchTag("ObjectNotFound", () => Effect.succeed(new Response(null, { status: 404 }))),
    ),
  );
};
