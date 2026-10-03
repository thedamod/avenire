import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Avenire",
  slug: "avenire",
  scheme: "avenire",
  userInterfaceStyle: "automatic",
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000",
    posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY,
    posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST,
  },
};

export default config;
