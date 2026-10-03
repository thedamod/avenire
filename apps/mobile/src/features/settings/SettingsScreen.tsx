import { useCallback, useEffect, useState } from "react";
import { Switch, Text, TextInput, View } from "react-native";
import { call } from "@avenire/client-runtime/rpc";
import type { CloudSchedule } from "@avenire/contracts";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ErrorState, errorMessage } from "../../components/ErrorState";
import { Screen } from "../../components/Screen";
import { useApi } from "../../state/api";
import { authClient } from "../../state/auth";

export function SettingsScreen() {
  const api = useApi();
  const [schedule, setSchedule] = useState<CloudSchedule>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string>();

  const loadSchedule = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setSchedule(await call(api, (client) => client["cloud.getSchedule"]()));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  const saveSchedule = async (next: CloudSchedule) => {
    const previous = schedule;
    setSchedule(next);
    setSaving(true);
    setError(undefined);
    try {
      setSchedule(await call(api, (client) => client["cloud.setSchedule"](next)));
    } catch (cause) {
      if (previous) setSchedule(previous);
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    setSigningOut(true);
    setError(undefined);
    try {
      const result = await authClient.signOut();
      if (result.error) setError(result.error.message ?? "Could not sign out");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <Screen title="Settings" subtitle="Control your nightly study brief and account.">
      {loading ? <Text className="text-muted-foreground">Loading schedule…</Text> : null}
      {error ? <ErrorState message={error} onRetry={() => void loadSchedule()} /> : null}
      {schedule ? (
        <Card>
          <View className="gap-4">
            <View className="flex-row items-center justify-between gap-4">
              <View className="flex-1 gap-1">
                <Text className="font-semibold text-foreground">Ruth Cloud overnight</Text>
                <Text className="text-sm text-muted-foreground">Runs in {schedule.timeZone}</Text>
              </View>
              <Switch
                value={schedule.enabled}
                onValueChange={(enabled) => void saveSchedule({ ...schedule, enabled })}
                accessibilityLabel="Enable nightly Ruth Cloud run"
              />
            </View>
            <Text className="text-sm font-medium text-foreground">Run time</Text>
            <TextInput
              value={schedule.runAt}
              onChangeText={(runAt) => setSchedule({ ...schedule, runAt })}
              onEndEditing={() => {
                if (/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.runAt)) {
                  void saveSchedule(schedule);
                } else {
                  setError("Enter a time in 24-hour format, such as 07:00.");
                }
              }}
              keyboardType="numbers-and-punctuation"
              placeholder="07:00"
              className="rounded-xl border border-border bg-background px-4 py-3 text-foreground"
            />
            {saving ? <Text className="text-sm text-muted-foreground">Saving…</Text> : null}
          </View>
        </Card>
      ) : null}
      <Button onPress={() => void signOut()} variant="secondary" busy={signingOut}>
        Sign out
      </Button>
    </Screen>
  );
}
