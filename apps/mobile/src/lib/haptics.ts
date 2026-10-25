import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * One haptic vocabulary for the app. Primitives pick the kind, screens rarely call this.
 * - tap: buttons that commit an action (Button, IconButton, GlassButton)
 * - selection: a choice changed (tabs, segments, chips)
 * - toggle-on / toggle-off: a switch flipped
 * - long-press: a long press opened something (context menu, selection)
 * - success / warning / error: the outcome of a commit, fired by the caller once it settles
 */
export type HapticKind =
  | "tap"
  | "selection"
  | "toggle-on"
  | "toggle-off"
  | "long-press"
  | "success"
  | "warning"
  | "error";

// Nested pressables and a primitive plus its caller can both ask for feedback on one gesture.
// Anything inside this window is the same touch, so only the first request buzzes.
const DEDUPE_MS = 80;
let last = 0;

function play(kind: HapticKind): Promise<void> {
  if (Platform.OS === "android") {
    // performAndroidHapticsAsync uses the system haptics engine (no VIBRATE permission).
    const type = {
      tap: Haptics.AndroidHaptics.Virtual_Key,
      selection: Haptics.AndroidHaptics.Segment_Tick,
      "toggle-on": Haptics.AndroidHaptics.Toggle_On,
      "toggle-off": Haptics.AndroidHaptics.Toggle_Off,
      "long-press": Haptics.AndroidHaptics.Long_Press,
      success: Haptics.AndroidHaptics.Confirm,
      warning: Haptics.AndroidHaptics.Reject,
      error: Haptics.AndroidHaptics.Reject,
    }[kind];
    return Haptics.performAndroidHapticsAsync(type);
  }
  switch (kind) {
    case "tap":
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    case "selection":
    case "toggle-on":
    case "toggle-off":
      return Haptics.selectionAsync();
    case "long-press":
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    case "success":
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    case "warning":
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    case "error":
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }
}

export function haptic(kind: HapticKind | "none" | undefined): void {
  if (!kind || kind === "none" || Platform.OS === "web") return;
  const now = Date.now();
  if (now - last < DEDUPE_MS) return;
  last = now;
  void play(kind).catch(() => undefined);
}
