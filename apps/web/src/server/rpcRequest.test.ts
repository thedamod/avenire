import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { boundedRpcRequest } from "./rpcRequest.ts";

const request = (body: string) => new Request("https://app.test/api/rpc", { method: "POST", body });
it.effect("terminates the final NDJSON envelope before handing it to the transport", () =>
  Effect.gen(function* () {
    const body = JSON.stringify({
      _tag: "Request",
      id: "1",
      tag: "settings.get",
      payload: null,
      headers: [],
    });
    const bounded = yield* boundedRpcRequest(request(body));
    expect(yield* Effect.promise(() => bounded.text())).toBe(`${body}\n`);
  }),
);
it.effect("rejects malformed NDJSON and invalid envelopes before entering the RPC transport", () =>
  Effect.gen(function* () {
    for (const body of [
      "",
      "{",
      "{}",
      "null",
      '{"_tag":"Request","id":1}',
      '{"_tag":"Ack"}',
      '{"_tag":"Request","id":1,"tag":"settings.get","payload":null,"headers":[null]}',
    ]) {
      expect(yield* boundedRpcRequest(request(body)).pipe(Effect.result)).toMatchObject({
        failure: { status: 400 },
      });
    }
  }),
);
it.effect("preserves batched requests and protocol control messages", () =>
  Effect.gen(function* () {
    const body =
      [
        { _tag: "Request", id: "1", tag: "settings.get", payload: null, headers: [] },
        {
          _tag: "Request",
          id: 2,
          tag: "library.listFiles",
          payload: {},
          headers: [["x-avenire-time-zone", "UTC"]],
        },
        { _tag: "Ack", requestId: "1" },
        { _tag: "Interrupt", requestId: 2 },
        { _tag: "Ping" },
        { _tag: "Eof" },
      ]
        .map((value) => JSON.stringify(value))
        .join("\n") + "\n";
    const bounded = yield* boundedRpcRequest(request(body));
    expect(yield* Effect.promise(() => bounded.text())).toBe(body);
  }),
);
