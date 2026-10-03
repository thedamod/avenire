/**
 * Browser analytics for the web app and the desktop renderer. Mobile uses
 * `posthog-react-native` directly because posthog-js does not run on Hermes.
 */
import { posthog } from "posthog-js";

export interface BrowserAnalyticsOptions {
  readonly key: string | undefined;
  readonly host: string;
  /** Distinguishes web from the desktop shell in PostHog. */
  readonly surface: "web" | "desktop";
}

let initialized = false;

export const initBrowserAnalytics = (options: BrowserAnalyticsOptions): void => {
  if (initialized || options.key === undefined || options.key === "") return;
  posthog.init(options.key, {
    api_host: options.host,
    person_profiles: "identified_only",
    capture_pageview: "history_change",
    capture_exceptions: true,
  });
  posthog.register({ surface: options.surface });
  initialized = true;
};

export const identifyUser = (userId: string, traits?: Record<string, string>): void => {
  if (initialized) posthog.identify(userId, traits);
};

export const resetAnalytics = (): void => {
  if (initialized) posthog.reset();
};

export const track = (event: string, properties?: Record<string, unknown>): void => {
  if (initialized) posthog.capture(event, properties);
};
