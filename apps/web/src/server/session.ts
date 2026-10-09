import { AuthService } from "@avenire/auth/server";
import * as Effect from "effect/Effect";
import { HttpRequestError } from "./http.ts";

export const requireUser = Effect.fn("Session.requireUser")(function* (request: Request) {
  const auth = yield* AuthService;
  const session = yield* auth.getSession(request.headers);
  if (session === null)
    return yield* new HttpRequestError({ status: 401, message: "Sign in to continue." });
  return session.id;
});
