import { requireOnboardingRoute } from "~/server/onboardingRoute";

export default async function OnboardingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireOnboardingRoute("onboarding");
  return children;
}
