import { CurrentUser, SettingsRpcs } from "@avenire/contracts";
import * as Effect from "effect/Effect";
import { Settings } from "./settings.ts";
import { sanitizeApiDefects } from "./apiErrors.ts";
export const SettingsHandlers = {
  "settings.get": (requestedTimeZone?: string) =>
    Effect.gen(function* () {
      return yield* (yield* Settings).get(yield* CurrentUser, requestedTimeZone);
    }).pipe(sanitizeApiDefects),
  "settings.update": (patch: import("@avenire/contracts").UserSettingsPatch) =>
    Effect.gen(function* () {
      return yield* (yield* Settings).update(yield* CurrentUser, patch);
    }).pipe(sanitizeApiDefects),
  "settings.completeOnboarding": (
    preferences: import("@avenire/contracts").OnboardingPreferences,
  ) =>
    Effect.gen(function* () {
      return yield* (yield* Settings).completeOnboarding(yield* CurrentUser, preferences);
    }).pipe(sanitizeApiDefects),
  "settings.updateProfile": ({ name }: { readonly name: string }) =>
    Effect.gen(function* () {
      return yield* (yield* Settings).updateProfile(yield* CurrentUser, name);
    }).pipe(sanitizeApiDefects),
  "settings.signOutOtherSessions": () =>
    Effect.gen(function* () {
      return yield* (yield* Settings).signOutOtherSessions(yield* CurrentUser);
    }).pipe(sanitizeApiDefects),
};
export const SettingsHandlersLive = SettingsRpcs.toLayer({
  ...SettingsHandlers,
  "settings.get": () => SettingsHandlers["settings.get"](),
});
