import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { AvenireClient, makeClientLayer } from "./rpc.ts";

it.effect("builds a typed RPC client without touching the network", () =>
  Effect.gen(function* () {
    const client = yield* AvenireClient;
    expect(typeof client["search.query"]).toBe("function");
  }).pipe(Effect.provide(makeClientLayer({ baseUrl: "https://example.test" }))),
);
