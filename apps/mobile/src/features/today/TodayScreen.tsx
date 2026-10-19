import { useState } from "react";
import { View } from "react-native";
import { call } from "@avenire/client-runtime/rpc";
import * as WebBrowser from "expo-web-browser";
import type { Asset, AssetId } from "@avenire/contracts";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, errorMessage } from "../../components/ErrorState";
import { ListRow } from "../../components/ListRow";
import { Screen } from "../../components/Screen";
import { useApi } from "../../state/api";
import { useQuery } from "../../lib/useRpc";

export function TodayScreen() {
  const api = useApi();
  const {
    data: runs,
    error,
    loading,
    refetch,
  } = useQuery((client) => client["cloud.listRuns"]({ limit: 1 }), "today-latest-run");
  const [openError, setOpenError] = useState<string>();
  const run = runs?.[0];
  const [running, setRunning] = useState(false);
  const runNow = async () => {
    setRunning(true);
    setOpenError(undefined);
    try {
      const tasks = await call(api, (client) => client["cloud.listTasks"]());
      const task = tasks.find((entry) => entry.builtin === "nightly-digest");
      if (!task) throw new Error("The nightly digest task was not found.");
      await call(api, (client) => client["cloud.runTaskNow"]({ taskId: task.id }));
      await refetch();
    } catch (cause) {
      setOpenError(errorMessage(cause));
    } finally {
      setRunning(false);
    }
  };

  const openAsset = async (assetId: AssetId) => {
    setOpenError(undefined);
    try {
      const result = await call(api, (client) => client["assets.get"]({ assetId }));
      await WebBrowser.openBrowserAsync(result.url);
    } catch (cause) {
      setOpenError(errorMessage(cause));
    }
  };

  const groupedAssets = run?.assets.reduce<Record<string, Asset[]>>((groups, asset) => {
    (groups[asset.kind] ??= []).push(asset);
    return groups;
  }, {});

  return (
    <Screen title="Today" subtitle="Your study material, prepared by Ruth.">
      {loading ? <ListRow title="Loading today's brief…" /> : null}
      {error ? <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} /> : null}
      {!loading && !error && !run ? (
        <EmptyState
          title="No Ruth Cloud run yet"
          description="Your next study brief will appear here."
        />
      ) : null}
      {run ? (
        <>
          <ListRow
            title={`${run.taskTitle} · ${run.status}`}
            detail={new Date(run.startedAt ?? run.scheduledFor).toLocaleString()}
          />
          {Object.entries(groupedAssets ?? {}).map(([kind, assets]) => (
            <View key={kind} className="gap-3">
              <ListRow title={kind} />
              {assets.map((asset) => (
                <ListRow
                  key={asset.id}
                  title={asset.title}
                  detail="Open asset"
                  onPress={() => void openAsset(asset.id)}
                />
              ))}
            </View>
          ))}
        </>
      ) : null}
      {openError ? <ErrorState message={openError} /> : null}
      <Button onPress={() => void runNow()} busy={running}>
        Run now
      </Button>
      <Button onPress={() => void refetch()} variant="secondary">
        Refresh
      </Button>
    </Screen>
  );
}
