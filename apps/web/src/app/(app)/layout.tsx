import { requireOnboardingRoute } from "~/server/onboardingRoute";
import AppLayoutClient from "./AppLayoutClient";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireOnboardingRoute("app");
  return <AppLayoutClient>{children}</AppLayoutClient>;
}
