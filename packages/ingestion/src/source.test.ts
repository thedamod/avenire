import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spoolMediaSource } from "./source.ts";

it.effect("spools verified media once and removes the private source after the job", () =>
  Effect.gen(function* () {
    const content = new TextEncoder().encode("original media");
    const digest = createHash("sha256").update(content).digest("hex");
    const path = yield* Effect.scoped(
      Effect.gen(function* () {
        const result = yield* spoolMediaSource(new Blob([content]).stream(), 100, digest);
        expect(yield* Effect.promise(() => readFile(result.source.path, "utf8"))).toBe(
          "original media",
        );
        expect((yield* Effect.promise(() => stat(result.source.path))).mode & 0o777).toBe(0o600);
        return result.source.path;
      }),
    );
    expect(
      yield* Effect.promise(() =>
        stat(path).then(
          () => true,
          () => false,
        ),
      ),
    ).toBe(false);
    for (const [limit, expected] of [
      [1, digest],
      [100, "0".repeat(64)],
    ] as const)
      expect(
        (yield* Effect.scoped(spoolMediaSource(new Blob([content]).stream(), limit, expected)).pipe(
          Effect.result,
        ))._tag,
      ).toBe("Failure");
  }),
);
