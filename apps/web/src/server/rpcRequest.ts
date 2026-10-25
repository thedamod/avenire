import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { boundedRequest, HttpRequestError } from "./http.ts";

// These are Effect's transport envelopes, before domain payloads are decoded by AvenireRpcs.
const id = Schema.Union([Schema.String, Schema.Number]);
const envelope = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal("Request"),
    id,
    tag: Schema.String,
    payload: Schema.Unknown,
    headers: Schema.Array(Schema.Tuple([Schema.String, Schema.String])),
    traceId: Schema.optionalKey(Schema.String),
    spanId: Schema.optionalKey(Schema.String),
    sampled: Schema.optionalKey(Schema.Boolean),
    isNotification: Schema.optionalKey(Schema.Literal(true)),
  }),
  Schema.Struct({ _tag: Schema.Literal("Ack"), requestId: id }),
  Schema.Struct({ _tag: Schema.Literal("Interrupt"), requestId: id }),
  Schema.Struct({ _tag: Schema.Literals(["Ping", "Eof"]) }),
]);
const valid = Schema.is(envelope);

/** The RPC transport trusts envelopes. Reject malformed NDJSON before it can defect. */
export const boundedRpcRequest = Effect.fn("Rpc.boundedRequest")(function* (request: Request) {
  const bounded = yield* boundedRequest(request);
  const text = yield* Effect.tryPromise({
    try: () => bounded.clone().text(),
    catch: () => new HttpRequestError({ status: 400, message: "Invalid RPC request." }),
  });
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  const accepted = yield* Effect.try({
    try: () => lines.length > 0 && lines.every((line) => valid(JSON.parse(line))),
    catch: () => new HttpRequestError({ status: 400, message: "Invalid RPC request." }),
  });
  if (!accepted)
    return yield* new HttpRequestError({ status: 400, message: "Invalid RPC request." });
  if (text.endsWith("\n")) return bounded;
  // Effect's NDJSON decoder needs the final separator to emit the last message.
  const headers = new Headers(bounded.headers);
  headers.delete("content-length");
  return new Request(bounded, { method: "POST", headers, body: `${text}\n` });
});
