import { expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import { assertMutationOrigin, assertRpcRequest, ExtensionIds } from "./session.ts";
const id = "a".repeat(32);
const config = ConfigProvider.fromUnknown({
  BETTER_AUTH_URL: "https://app.test",
  AVENIRE_EXTENSION_IDS: ` ${id}, ${"p".repeat(32)} `,
});
const request = (method: string, path: string, origin = `chrome-extension://${id}`) =>
  new Request(`https://app.test${path}`, {
    method,
    headers: { origin, "content-type": "application/ndjson" },
  });
it.effect("extension origins are exact and limited to capture and source-upload mutations", () =>
  Effect.gen(function* () {
    for (const [method, path] of [
      ["POST", "/api/library/captures"],
      ["POST", "/api/library/uploads"],
      ["PUT", "/api/library/uploads/ticket"],
      ["POST", "/api/library/uploads/ticket"],
      ["DELETE", "/api/library/uploads/ticket"],
    ]) {
      yield* assertMutationOrigin(request(method!, path!));
      for (const origin of [
        `chrome-extension://${id}/`,
        `chrome-extension://${id}.evil`,
        `chrome-extension://${"b".repeat(32)}`,
        `moz-extension://${id}`,
        "null",
      ])
        expect(
          yield* assertMutationOrigin(request(method!, path!, origin)).pipe(Effect.result),
        ).toMatchObject({ failure: { status: 403 } });
    }
    for (const [method, path] of [
      ["POST", "/api/rpc"],
      ["POST", "/api/library/files"],
      ["DELETE", "/api/library/uploads"],
      ["PATCH", "/api/library/uploads/ticket"],
      ["PUT", "/api/library/uploads/ticket/extra"],
      ["POST", "/api/library/captures/extra"],
    ])
      expect(
        yield* assertMutationOrigin(request(method!, path!)).pipe(Effect.result),
      ).toMatchObject({ failure: { status: 403 } });
    expect(yield* assertRpcRequest(request("POST", "/api/rpc")).pipe(Effect.result)).toMatchObject({
      failure: { status: 403 },
    });
  }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, config)),
);
it.effect("extension ids default empty and reject malformed configuration", () =>
  Effect.gen(function* () {
    expect(
      yield* ExtensionIds.pipe(
        Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown({})),
      ),
    ).toEqual([]);
    for (const value of ["invalid", "q".repeat(32), `${id},`, `${id}, chrome-extension://${id}`])
      expect(
        (yield* ExtensionIds.pipe(
          Effect.provideService(
            ConfigProvider.ConfigProvider,
            ConfigProvider.fromUnknown({ AVENIRE_EXTENSION_IDS: value }),
          ),
          Effect.result,
        ))._tag,
      ).toBe("Failure");
    expect(
      yield* assertMutationOrigin(request("POST", "/api/library/uploads")).pipe(
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown({ BETTER_AUTH_URL: "https://app.test" }),
        ),
        Effect.result,
      ),
    ).toMatchObject({ failure: { status: 403 } });
  }),
);
