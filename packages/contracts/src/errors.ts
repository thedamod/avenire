import * as Schema from "effect/Schema";

/** The caller has no session, or the session expired. */
export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {}) {
  override get message(): string {
    return "Not signed in";
  }
}

export class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  entity: Schema.String,
  id: Schema.String,
}) {
  override get message(): string {
    return `${this.entity} ${this.id} was not found`;
  }
}

/** A request that is well-formed but not allowed in the current state. */
export class Conflict extends Schema.TaggedError<Conflict>()("Conflict", {
  reason: Schema.String,
}) {
  override get message(): string {
    return this.reason;
  }
}

/** Unexpected server-side failure. Details stay in traces, not on the wire. */
export class InternalError extends Schema.TaggedError<InternalError>()("InternalError", {
  traceId: Schema.optional(Schema.String),
}) {
  override get message(): string {
    return "Something went wrong";
  }
}

export const ApiError = Schema.Union([Unauthorized, NotFound, Conflict, InternalError]);
export type ApiError = typeof ApiError.Type;
