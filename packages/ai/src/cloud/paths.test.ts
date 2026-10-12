import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { Database } from "@avenire/database/client";
import { userInputsSlug, inputsRootFor } from "./paths.ts";
import { recordingDatabase } from "../cloud-test-support.ts";
import { UserId } from "@avenire/contracts";
it("slugs spaces, Unicode and unusable names into bounded filesystem-safe components", () => {
  expect(userInputsSlug("  Zoë 李 / Science  ", "user-1")).toMatch(/^zoe-science-[a-f0-9]{10}$/);
  expect(userInputsSlug("李", "user-1")).toMatch(/^user-[a-f0-9]{10}$/);
  expect(userInputsSlug("Zoë", "user-1")).not.toBe(userInputsSlug("Zoë", "user-2"));
});
it.effect("persists the namespace once and keeps it stable after a display-name change", () => {
  const db = recordingDatabase();
  db.rows("user").push({ id: "user", name: "Zoë Smith", cloudInputsSlug: null });
  return Effect.gen(function* () {
    const first = yield* inputsRootFor({ userId: UserId.make("user") });
    db.rows("user")[0]!.name = "New Name";
    expect(yield* inputsRootFor({ userId: UserId.make("user") })).toBe(first);
    expect(first).toMatch(/^\/home\/daytona\/\.avenire\/zoe-smith-[a-f0-9]{10}$/);
  }).pipe(Effect.provideService(Database, db.database));
});
