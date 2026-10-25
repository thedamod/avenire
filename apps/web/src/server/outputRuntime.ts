/** Private output transport does not start chat models, retrieval or sandbox workers. */
import { AssetStoreLive } from "@avenire/ai/outputs/assets";
import { WidgetStoreLive } from "@avenire/ai/outputs/widgets";
import { AuthLive } from "@avenire/auth/server";
import { DatabaseLive } from "@avenire/database/client";
import { MailerLive } from "@avenire/emailer/mailer";
import { StorageLive } from "@avenire/storage/storage";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { HttpRequestError } from "./http.ts";
import { WidgetHostLive } from "./widgetHost.ts";
export const OutputServicesLive = Layer.mergeAll(
  AuthLive,
  WidgetHostLive,
  WidgetStoreLive.pipe(Layer.provideMerge(AssetStoreLive)),
).pipe(
  Layer.provideMerge(Layer.mergeAll(DatabaseLive, StorageLive, MailerLive, NodeServices.layer)),
);
const makeRuntime = () => ManagedRuntime.make(OutputServicesLive);
let runtime: ReturnType<typeof makeRuntime> | undefined;
export const runOutputRoute = <E>(
  effect: Effect.Effect<Response, E, Layer.Success<typeof OutputServicesLive>>,
): Promise<Response> => {
  const current = (runtime ??= makeRuntime());
  return current
    .runPromise(
      effect.pipe(
        Effect.catchIf(
          (error): error is E & HttpRequestError => error instanceof HttpRequestError,
          (error) =>
            Effect.succeed(Response.json({ error: error.message }, { status: error.status })),
        ),
        Effect.catchCause((cause) =>
          Effect.logError("Output route failed", cause).pipe(
            Effect.as(Response.json({ error: "The output could not be loaded." }, { status: 500 })),
          ),
        ),
      ),
    )
    .catch(() => Response.json({ error: "The output service is unavailable." }, { status: 500 }));
};
