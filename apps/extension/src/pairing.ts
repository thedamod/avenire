import { CapturePairing, ExtensionAuth, type ExtensionMessage } from "@avenire/contracts";
import * as Schema from "effect/Schema";
import { apiJson, ApiError } from "./wire.ts";

export interface PairingState {
  readonly connected: boolean;
  readonly needsCode: boolean;
  readonly signedIn: boolean | undefined;
  readonly rejection?: "unpaired" | "account-mismatch" | "unsupported-version";
}
export const initialPairing: PairingState = {
  connected: false,
  needsCode: false,
  signedIn: undefined,
};
export function pairingTransition(
  state: PairingState,
  message: ExtensionMessage | "disconnect",
): PairingState {
  if (message === "disconnect") return { ...state, connected: false };
  if (message._tag === "Welcome")
    return { connected: true, needsCode: false, signedIn: state.signedIn };
  if (message._tag === "Rejected")
    return {
      connected: false,
      needsCode: message.reason === "unpaired",
      signedIn: state.signedIn,
      rejection: message.reason,
    };
  return state;
}

/** The owner's pairing token and read-in-browser choice; undefined when not signed in. */
export async function fetchPairing(
  appUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<CapturePairing | undefined> {
  try {
    return await apiJson(fetcher, `${appUrl}/api/capture/pairing`, CapturePairing);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 404))
      return undefined;
    throw error;
  }
}

export async function pairingToken(
  appUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<ExtensionAuth | undefined> {
  const pairing = await fetchPairing(appUrl, fetcher);
  return pairing && { _tag: "Token", token: pairing.token };
}

export async function chooseAuth(
  storage: chrome.storage.StorageArea,
  appUrl: string,
  code?: string,
  fetcher: typeof fetch = fetch,
): Promise<ExtensionAuth | undefined> {
  if (code !== undefined) return Schema.decodeUnknownSync(ExtensionAuth)({ _tag: "Code", code });
  const stored = await storage.get("pairingSecret");
  if (stored.pairingSecret) {
    try {
      return Schema.decodeUnknownSync(ExtensionAuth)({
        _tag: "Secret",
        secret: stored.pairingSecret,
      });
    } catch {
      await storage.remove("pairingSecret");
    }
  }
  return pairingToken(appUrl, fetcher);
}
