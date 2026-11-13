import { useRef, useState } from "react";
import { Platform } from "react-native";
import { call, invalidateLibrary } from "@avenire/client-runtime/rpc";
import type { OnboardingPreferences } from "@avenire/contracts";
import { useQuery } from "../../lib/useRpc";
import { loadNotifications } from "../../lib/notifications";
import { useApi } from "../../state/api";
import { errorMessage } from "../../ui/ErrorState";

export type MaterialSource = NonNullable<OnboardingPreferences["materialSources"]>[number];

export function useOnboardingData() {
  const runtime = useApi();
  const query = useQuery((client) => client["settings.get"](), "settings");
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const complete = async (answers: OnboardingPreferences) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(undefined);
    try {
      // Mirrors WebOnboarding. This transaction saves answers and the completion timestamp.
      await call(runtime, (client) => client["settings.completeOnboarding"](answers));
      // SignedInStack subscribes to this projection and replaces its gated navigator.
      invalidateLibrary(runtime, ["settings"]);
    } catch (cause) {
      setError(`Couldn’t finish setup: ${errorMessage(cause)}`);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  return { ...query, complete, busy, saveError: error };
}

export function useNotificationPermission() {
  const requesting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const request = async (): Promise<boolean | undefined> => {
    if (requesting.current) return undefined;
    const Notifications = loadNotifications();
    if (!Notifications) return false;
    requesting.current = true;
    setBusy(true);
    setError(undefined);
    try {
      // Android 13 needs a channel before the OS notification permission prompt.
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("morning-report", {
          name: "Morning report",
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }
      let permission = await Notifications.getPermissionsAsync();
      if (!permission.granted && permission.canAskAgain) {
        permission = await Notifications.requestPermissionsAsync({
          ios: { allowAlert: true, allowBadge: true, allowSound: true },
        });
      }
      return (
        permission.granted ||
        permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
        permission.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL
      );
    } catch (cause) {
      setError(`Couldn’t request notifications: ${errorMessage(cause)}`);
      return undefined;
    } finally {
      requesting.current = false;
      setBusy(false);
    }
  };

  return { request, busy, error };
}

export interface NotificationExample {
  id: string;
  title: string;
  body: string;
  time: string;
}

// Illustrative content from M35, never delivered or represented as actual OS notifications.
const notificationExamples: readonly NotificationExample[] = [
  {
    id: "morning",
    title: "Ava finished 3 things overnight.",
    body: "Summary, quiz and revision notes for Thermodynamics.",
    time: "7:00 AM",
  },
  {
    id: "needs-you",
    title: "Ava needs you",
    body: "Lecture 9 is password-protected. Enter it, or skip it?",
    time: "2:14 AM",
  },
];

export function useNotificationExamples() {
  return { data: notificationExamples, loading: false, error: undefined };
}

interface ComputerSetup {
  connection: "unknown" | "connected" | "disconnected";
  canEmailApp: boolean;
}

// No desktop-presence or app-download-email RPC exists. Do not infer a computer
// connection from browser sessions, or claim an email has been sent.
const computerSetup: ComputerSetup = { connection: "unknown", canEmailApp: false };

export function useComputerSetup() {
  return { data: computerSetup, loading: false, error: undefined };
}
