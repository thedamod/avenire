import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import type * as NotificationsModule from "expo-notifications";

export type Notifications = typeof NotificationsModule;

let cached: Notifications | null | undefined;

/**
 * expo-notifications can't load in Android Expo Go (push support was removed in SDK 53, and its
 * `ExpoTopicSubscriptionModule` native module is missing). A failed require also leaves Metro
 * holding a half-initialised module, so a later require can return an object without its exports.
 * Skip the require where it's known to fail, and only accept a module that is fully populated.
 */
export function loadNotifications(): Notifications | null {
  if (Platform.OS === "web") return null;
  if (cached === undefined) {
    cached = null;
    const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
    if (!(Platform.OS === "android" && inExpoGo)) {
      try {
        const loaded = require("expo-notifications") as Notifications;
        if (
          typeof loaded?.getPermissionsAsync === "function" &&
          loaded.IosAuthorizationStatus !== undefined &&
          loaded.AndroidImportance !== undefined
        ) {
          cached = loaded;
        }
      } catch {
        cached = null;
      }
    }
  }
  return cached;
}
