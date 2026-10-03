import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";

/** Satisfied by `expo-secure-store`, without making this package depend on it. */
export type ExpoStorage = Parameters<typeof expoClient>[0]["storage"];

export const createAvenireExpoAuthClient = ({
  baseURL,
  scheme = "avenire",
  storage,
}: {
  readonly baseURL: string;
  readonly scheme?: string;
  readonly storage: ExpoStorage;
}) =>
  createAuthClient({
    baseURL,
    plugins: [
      expoClient({
        scheme,
        storagePrefix: "avenire",
        storage,
      }),
    ],
  });

export type AvenireExpoAuthClient = ReturnType<typeof createAvenireExpoAuthClient>;

export const getCookieHeader = (client: AvenireExpoAuthClient): Promise<string> =>
  client.getCookie();
