/** Missing users/sessions sign in; only incomplete users enter onboarding. */
export const onboardingRedirect = (
  route: "app" | "onboarding",
  user: { readonly onboardingCompletedAt: Date | null } | null,
): "/sign-in" | "/onboarding" | "/" | null => {
  if (!user) return "/sign-in";
  if (route === "app" && user.onboardingCompletedAt === null) return "/onboarding";
  if (route === "onboarding" && user.onboardingCompletedAt !== null) return "/";
  return null;
};
