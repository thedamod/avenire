import type { Metadata } from "next";
import { WebOnboarding } from "~/features/onboarding/WebOnboarding";

export const metadata: Metadata = { title: "Welcome" };

/** First login only; the layout sends finished users home. */
export default function OnboardingPage() {
  return <WebOnboarding />;
}
