import * as Context from "effect/Context";
import * as RpcMiddleware from "effect/rpc/RpcMiddleware";

import { Unauthorized } from "./errors.ts";
import { UserId } from "./ids.ts";

export interface SessionUser {
  readonly id: UserId;
  /** Server-resolved session identity; never supplied by RPC message metadata. */
  readonly sessionId?: string;
  readonly email: string;
  readonly name: string;
}

/** The signed-in user for the current request. Provided by `Authenticated`. */
export class CurrentUser extends Context.Service<CurrentUser, SessionUser>()(
  "avenire/session/CurrentUser",
) {}

/** RPC middleware that resolves the session and provides `CurrentUser`, or fails `Unauthorized`. */
export class Authenticated extends RpcMiddleware.Service<
  Authenticated,
  { provides: CurrentUser }
>()("avenire/session/Authenticated", { error: Unauthorized }) {}
