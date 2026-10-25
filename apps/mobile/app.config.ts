import type { ExpoConfig } from "expo/config";

// One env file for the monorepo: the repo-root .env.local (Expo only reads apps/mobile/.env*).
// Already-exported variables win, so `EXPO_PUBLIC_API_URL=... pnpm dev:mobile` still overrides it.
declare const __dirname: string;

try {
  process.loadEnvFile(`${__dirname}/../../.env.local`);
} catch {
  // No root env file: fall back to the shell environment.
}

const config: ExpoConfig = {
  name: "Avenire",
  slug: "avenire",
  owner: "avenires-team",
  scheme: "avenire",
  icon: "./assets/brand/icon.png",
  userInterfaceStyle: "dark",
  backgroundColor: "#0B0B0B",
  plugins: [
    "./plugins/with-http-api.cjs",
    "expo-font",
    [
      "expo-splash-screen",
      {
        image: "./assets/brand/splash.png",
        imageWidth: 320,
        backgroundColor: "#0B0B0B",
        resizeMode: "contain",
      },
    ],
  ],
  web: { bundler: "metro", favicon: "./assets/brand/favicon.png" },
  ios: { bundleIdentifier: "com.thedamod.avenire" },
  android: {
    package: "com.thedamod.avenire",
    softwareKeyboardLayoutMode: "resize",
    adaptiveIcon: {
      foregroundImage: "./assets/brand/adaptive-foreground.png",
      backgroundColor: "#0B0B0B",
    },
  },
  extra: {
    eas: { projectId: "4d3c4c25-389f-4073-95dd-ea450bdd9afa" },
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY,
    posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST,
  },
};

export default config;
