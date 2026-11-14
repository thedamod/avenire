import { NativeModules, Platform } from "react-native";

export interface AndroidTriggerStatus {
  enabled: boolean;
  nothing: boolean;
  essentialKey: boolean;
  assistantAvailable: boolean;
  assistant: boolean;
  widget: boolean;
}
export interface NativeScreenBridge {
  getTriggerStatus(): Promise<AndroidTriggerStatus>;
  configureTrigger(trigger: "accessibility" | "assistant" | "widget" | "gestures"): Promise<void>;
  setEssentialKey(enabled: boolean): Promise<void>;
  canShareScreen(session: string): Promise<boolean>;
  isSessionActive(session: string): Promise<boolean>;
  updateResponse(session: string, text: string, done: boolean, threadId: string): Promise<void>;
  bindOwner(owner: string): Promise<void>;
  clearSession(): Promise<void>;
  getScreenContext(session: string): Promise<unknown>;
  presentAnnotations(session: string, result: string): Promise<void>;
}
/** Non-Android clients and explicitly disabled native builds have no bridge. */
export function nativeScreenBridge(): NativeScreenBridge | undefined {
  if (Platform.OS !== "android") return undefined;
  const module: unknown = NativeModules.AvenireScreen;
  // An OTA update must not use an older native bridge without the screen-policy gate.
  return module &&
    typeof module === "object" &&
    "presentAnnotations" in module &&
    "getTriggerStatus" in module &&
    typeof module.getTriggerStatus === "function" &&
    "canShareScreen" in module &&
    typeof module.canShareScreen === "function"
    ? (module as NativeScreenBridge)
    : undefined;
}
