import { useCallback, useEffect, useState } from "react";
import { Switch, Text, TextInput, View } from "react-native";
import { call } from "@avenire/client-runtime/rpc";
import type { CloudTask } from "@avenire/contracts";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ErrorState, errorMessage } from "../../components/ErrorState";
import { Screen } from "../../components/Screen";
import { useApi } from "../../state/api";
import { authClient } from "../../state/auth";

export function SettingsScreen() {
  const api = useApi();
  const [schedule, setSchedule] = useState<CloudTask>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string>();

  const loadSchedule = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const tasks = await call(api, (client) => client["cloud.listTasks"]());
      setSchedule(tasks.find((task) => task.builtin === "nightly-digest"));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- Fetch the persisted task when the authenticated API changes.
    void loadSchedule();
  }, [loadSchedule]);

  const saveSchedule = async (next: CloudTask) => {
    const previous = schedule;
    setSchedule(next);
    setSaving(true);
    setError(undefined);
    try {
      setSchedule(
        await call(api, (client) =>
          client["cloud.updateTask"]({
            taskId: next.id,
            patch: { enabled: next.enabled, schedule: next.schedule, timeZone: next.timeZone },
          }),
        ),
      );
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
            <Text className="text-sm font-medium text-foreground">Cron expression</Text>
            <TextInput
              value={schedule.schedule._tag === "cron" ? schedule.schedule.expression : ""}
              onChangeText={(expression) =>
                setSchedule({ ...schedule, schedule: { _tag: "cron", expression } })
              }
              onEndEditing={() => void saveSchedule(schedule)}
              placeholder="0 3 * * *"
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
