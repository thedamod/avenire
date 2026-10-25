import { RuthLive } from "@avenire/ai/ruth";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { HttpRequestError } from "./http.ts";
import { ServicesLive } from "./services.ts";

export const ServerLive = RuthLive.pipe(Layer.provideMerge(ServicesLive));
type ServerServices = Layer.Success<typeof ServerLive>;
let runtime:
  | ManagedRuntime.ManagedRuntime<ServerServices, Layer.Error<typeof ServerLive>>
  | undefined;
const serverRuntime = () => (runtime ??= ManagedRuntime.make(ServerLive));

/** One scope keeps request services and sandbox state alive across requests. */
export const runRoute = <E>(
  effect: Effect.Effect<Response, E, ServerServices>,
): Promise<Response> =>
  serverRuntime()
    .runPromise(
      effect.pipe(
        Effect.catchIf(
          (error): error is E & HttpRequestError => error instanceof HttpRequestError,
          (error) =>
            Effect.succeed(Response.json({ error: error.message }, { status: error.status })),
        ),
        Effect.catchCause((cause) =>
          Effect.logError("Server route failed", cause).pipe(
            Effect.as(
              Response.json({ error: "The request could not be completed." }, { status: 500 }),
            ),
          ),
        ),
      ),
    )
    .catch((cause) =>
      Effect.runPromise(
        Effect.logError("Server runtime initialization failed", cause).pipe(
          Effect.as(Response.json({ error: "The server is unavailable." }, { status: 500 })),
        ),
      ),
    );
