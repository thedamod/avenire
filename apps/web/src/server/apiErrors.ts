import * as Effect from "effect/Effect";
import { type ApiError, Conflict, InternalError, NotFound, Unauthorized } from "@avenire/contracts";

/** Infrastructure details belong in traces, never in an application response. */
export const toApiError = (error: unknown): ApiError =>
  error instanceof NotFound ||
  error instanceof Conflict ||
  error instanceof Unauthorized ||
  error instanceof InternalError
    ? error
    : new InternalError({});

/** Prevent unexpected infrastructure defects from becoming RPC protocol defect payloads. */
export const sanitizeApiDefects = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.catchDefect((cause) =>
      Effect.logError("Application operation failed", cause).pipe(
        Effect.andThen(Effect.fail(new InternalError({}))),
      ),
    ),
  );
