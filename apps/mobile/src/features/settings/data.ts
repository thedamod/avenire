import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform } from "react-native";
import { call } from "@avenire/client-runtime/rpc";
import type { UserSettingsPatch } from "@avenire/contracts";
import { useQuery } from "../../lib/useRpc";
import { loadNotifications, type Notifications } from "../../lib/notifications";
import { useApi } from "../../state/api";
import { authClient } from "../../state/auth";
import { errorMessage } from "../../ui";

export function useSettingsData() {
  const query = useQuery((client) => client["settings.get"](), "settings");
  const trash = useQuery((client) => client["library.listTrash"](), "library-trash");
  const api = useApi();
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function mutate(run: () => Promise<unknown>) {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await run();
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  const save = (patch: UserSettingsPatch) =>
    mutate(async () => {
      const settings = await call(api, (client) => client["settings.update"](patch));
      query.setData((previous) => (previous ? { ...previous, settings } : previous));
    });
  const saveProfile = (name: string) =>
    mutate(async () => {
      await call(api, (client) => client["settings.updateProfile"]({ name }));
      query.setData((previous) =>
        previous ? { ...previous, account: { ...previous.account, name } } : previous,
      );
    });
  const signOutOthers = () =>
    mutate(async () => {
      await call(api, (client) => client["settings.signOutOtherSessions"]());
      void query.refetch();
    });
  const signOut = () =>
    mutate(async () => {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message ?? "Couldn't sign out.");
    });
  return { ...query, trash, busy, mutationError: error, save, saveProfile, signOutOthers, signOut };
}

export function useNotificationPermission() {
  const [permission, setPermission] = useState<Awaited<ReturnType<Notifications["getPermissionsAsync"]>>>();
  const [error, setError] = useState<string>();
  const Notifications = loadNotifications();
  const supported = (Platform.OS === "ios" || Platform.OS === "android") && Notifications !== null;
  const refresh = useCallback(async () => {
    if (!Notifications) return;
    try {
      setPermission(await Notifications.getPermissionsAsync());
      setError(undefined);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, [Notifications]);
  useEffect(() => {
    void refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);
  const granted =
    Notifications !== null &&
    (permission?.granted === true ||
      permission?.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
      permission?.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL);
  async function request() {
    if (!Notifications) return false;
    try {
      if (Platform.OS === "android")
        await Notifications.setNotificationChannelAsync("default", {
          name: "Avenire",
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      const current = await Notifications.getPermissionsAsync();
      const next =
        current.granted || !current.canAskAgain
          ? current
          : await Notifications.requestPermissionsAsync({
              ios: { allowAlert: true, allowBadge: true, allowSound: true },
            });
      setPermission(next);
      setError(undefined);
      return (
        next.granted ||
        next.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
        next.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL
      );
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    }
  }
  return {
    supported,
    permission,
    granted,
    error,
    request,
    refresh,
    openSettings: () => Linking.openSettings(),
  };
}

/** No RPC exposes desktop bridge preferences or WebDAV configuration on mobile yet. */
type DesktopSettings = {
  status: "unavailable";
  shortcut: null;
  windowPermissions: null;
  connectedFolders: null;
  webDavUrl: null;
};
const desktopFixture: DesktopSettings = {
  status: "unavailable",
  shortcut: null,
  windowPermissions: null,
  connectedFolders: null,
  webDavUrl: null,
};
export function useDesktopSettings() {
  return { data: desktopFixture, loading: false, error: undefined };
}
