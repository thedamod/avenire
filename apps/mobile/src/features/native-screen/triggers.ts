import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { nativeScreenBridge, type AndroidTriggerStatus } from "./native";

export function useAndroidTriggers() {
  const bridge = nativeScreenBridge();
  const [status, setStatus] = useState<AndroidTriggerStatus>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => {
    let alive = true;
    void nativeScreenBridge()
      ?.getTriggerStatus()
      .then((value) => {
        if (alive) setStatus(value);
      })
      .catch(() => {
        if (alive) setError("Couldn't read Android shortcut settings.");
      });
    return () => {
      alive = false;
    };
  }, []);
  useFocusEffect(refresh);
  useEffect(() => {
    let alive = true;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active")
        void nativeScreenBridge()
          ?.getTriggerStatus()
          .then((value) => {
            if (alive) setStatus(value);
          })
          .catch(() => {
            if (alive) setError("Couldn't read Android shortcut settings.");
          });
    });
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);
  async function configure(trigger: "accessibility" | "assistant" | "widget" | "gestures") {
    if (!bridge || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await bridge.configureTrigger(trigger);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't open Android settings.");
    } finally {
      setBusy(false);
    }
  }
  async function essentialKey(enabled: boolean) {
    if (!bridge || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await bridge.setEssentialKey(enabled);
      setStatus(await bridge.getTriggerStatus());
    } catch {
      setError("Couldn't update the Essential Key listener.");
    } finally {
      setBusy(false);
    }
  }
  return { available: Boolean(bridge), status, error, busy, configure, essentialKey };
}
