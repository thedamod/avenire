import { expect, it } from "@effect/vitest";
import { InvalidToolInputError } from "ai";
import { RuthToolError } from "../tools/core.ts";
import { ruthStreamError } from "./stream-error.ts";

it("preserves actionable tool failures without exposing provider or argument details", () => {
  expect(
    ruthStreamError(
      new RuthToolError({
        tool: "sandbox_write",
        code: "invalid_input",
        message: "File exceeds the 10 MiB write limit.",
        recoverable: true,
      }),
    ),
  ).toBe("File exceeds the 10 MiB write limit.");
  expect(
    ruthStreamError(
      new InvalidToolInputError({
        toolName: "preview_widget",
        toolInput: "private widget source",
        cause: new Error("private schema input"),
      }),
    ),
  ).toBe("The tool arguments were invalid. Ruth can correct them and try again.");
  expect(ruthStreamError(new Error("Authorization: Bearer secret"))).toBe(
    "Ruth ran into a problem. Please try again.",
  );
  expect(
    ruthStreamError(
      new RuthToolError({ tool: "sandbox_write", code: "failed", message: "", recoverable: true }),
    ),
  ).toBe("Ruth ran into a problem. Please try again.");
  expect(ruthStreamError({ _tag: "RuthToolError", message: "Untrusted error" })).toBe(
    "Ruth ran into a problem. Please try again.",
  );
});
