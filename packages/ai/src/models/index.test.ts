import { expect, it } from "@effect/vitest";
import { RUTH_MODEL_CAPABILITIES, RUTH_MODEL_NAMES } from "./index.ts";

it("has a capability entry and screen profile for every Ruth model", () => {
  expect(Object.keys(RUTH_MODEL_CAPABILITIES).sort()).toEqual([...RUTH_MODEL_NAMES].sort());
  for (const name of RUTH_MODEL_NAMES)
    expect(RUTH_MODEL_CAPABILITIES[name].screenProfile).toBeDefined();
});

it("runs sprint at low reasoning effort and no other model", () => {
  expect(
    RUTH_MODEL_NAMES.filter((name) => RUTH_MODEL_CAPABILITIES[name].reasoning === "low"),
  ).toEqual(["ruth-sprint"]);
});
