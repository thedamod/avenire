import { expect, it } from "@effect/vitest";
import { onboardingRedirect } from "./onboarding.ts";

it("routes first-login, completed and unauthenticated users without loops", () => {
  const incomplete = { onboardingCompletedAt: null };
  const complete = { onboardingCompletedAt: new Date("2026-01-01") };
  expect(onboardingRedirect("app", null)).toBe("/sign-in");
  expect(onboardingRedirect("onboarding", null)).toBe("/sign-in");
  expect(onboardingRedirect("app", incomplete)).toBe("/onboarding");
  expect(onboardingRedirect("onboarding", incomplete)).toBeNull();
  expect(onboardingRedirect("app", complete)).toBeNull();
  expect(onboardingRedirect("onboarding", complete)).toBe("/");
});
