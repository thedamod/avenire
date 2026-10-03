import { describe, expect, it } from "@effect/vitest";

import { validateSandboxInput } from "./sandbox.ts";

describe("validateSandboxInput", () => {
  it("accepts bounded code, pip requirements and timeouts", () => {
    expect(
      validateSandboxInput({
        code: "print('ok')",
        packages: ["numpy", "scikit-learn", "sympy==1.13"],
        timeoutSeconds: 30,
      }),
    ).toBeUndefined();
  });

  it("rejects shell injection in package names", () => {
    expect(
      validateSandboxInput({ code: "x", packages: ["numpy; touch /tmp/pwned"] }),
    ).toBeDefined();
  });

  it("rejects out-of-range timeouts, oversized code and long package lists", () => {
    expect(validateSandboxInput({ code: "x", timeoutSeconds: 9 })).toBeDefined();
    expect(validateSandboxInput({ code: "x".repeat(60_001) })).toBeDefined();
    expect(
      validateSandboxInput({ code: "x", packages: Array.from({ length: 21 }, () => "numpy") }),
    ).toBeDefined();
  });
});
