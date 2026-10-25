import { expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import { prettyWorkerCause } from "./error-cause.ts";

it("renders nested worker failures and redacts credentials and SQL parameters", () => {
  const root = new Error("storage read failed at https://files.example/private?token=secret");
  const wrapped = new Error("Ingestion failed while reading the source", { cause: root });
  const result = prettyWorkerCause(Cause.fail(wrapped));
  expect(result).toContain("Ingestion failed while reading the source");
  expect(result).toContain("storage read failed");
  expect(result).not.toContain("token=secret");
  const db = prettyWorkerCause(
    Cause.fail(new Error("query failed\nparams: secret\nauthorization: Bearer abc")),
  );
  expect(db).not.toContain("secret");
  expect(db).not.toContain("abc");
});
