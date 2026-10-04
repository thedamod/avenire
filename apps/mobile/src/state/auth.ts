import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

/** Origin of the Avenire web server the app talks to. */
export const apiUrl: string = Constants.expoConfig?.extra?.apiUrl ?? "http://localhost:3000";

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
