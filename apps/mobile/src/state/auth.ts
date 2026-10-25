import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const WEB_DEV_PORT = 3000;

/**
 * Origin of the Avenire web server the app talks to: `EXPO_PUBLIC_API_URL` when set. In dev
 * it falls back to the host the phone already reaches Metro on (LAN or Tailnet), since the web
 * server runs on the same machine. `localhost` only works on a simulator.
 */
function resolveApiUrl(): string {
  const configured: unknown = Constants.expoConfig?.extra?.apiUrl;
  if (typeof configured === "string" && configured !== "") return configured.replace(/\/$/, "");
  const metroHost = __DEV__ ? Constants.expoConfig?.hostUri?.split(":")[0] : undefined;
  return `http://${metroHost || "localhost"}:${WEB_DEV_PORT}`;
}

export const apiUrl: string = resolveApiUrl();

export const authClient = createAuthClient({
  baseURL: apiUrl,
  plugins: [
    expoClient({
      scheme: "avenire",
      storagePrefix: "avenire",
      storage: SecureStore,
    }),
  ],
});

export async function getCookieHeader(): Promise<Record<string, string>> {
  const cookie = await authClient.getCookie();
  return cookie ? { Cookie: cookie } : {};
}
