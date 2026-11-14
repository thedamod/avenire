import { NativeModules, Platform } from "react-native";

export interface NativeScreenBridge {
  isSessionActive(session: string): Promise<boolean>;
  updateResponse(session: string, text: string, done: boolean, threadId: string): Promise<void>;
  bindOwner(owner: string): Promise<void>;
  clearSession(): Promise<void>;
  getScreenContext(session: string): Promise<unknown>;
  presentAnnotations(session: string, result: string): Promise<void>;
}
/** Standard builds and non-Android clients never register this module. */
export function nativeScreenBridge(): NativeScreenBridge | undefined {
  if (Platform.OS !== "android") return undefined;
  const module: unknown = NativeModules.AvenireScreen;
  return module && typeof module === "object" && "presentAnnotations" in module
    ? (module as NativeScreenBridge)
    : undefined;
}
