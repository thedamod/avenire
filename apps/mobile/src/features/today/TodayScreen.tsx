import { useState } from "react";
import { View } from "react-native";
import { call } from "@avenire/client-runtime/rpc";
import * as WebBrowser from "expo-web-browser";
import type { Artifact, ArtifactId } from "@avenire/contracts";
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

  const openArtifact = async (artifactId: ArtifactId) => {
    setOpenError(undefined);
    try {
      const result = await call(api, (client) => client["cloud.artifactUrl"]({ artifactId }));
      await WebBrowser.openBrowserAsync(result.url);
    } catch (cause) {
      setOpenError(errorMessage(cause));
    }
  };

  const groupedArtifacts = run?.artifacts.reduce<Record<string, Artifact[]>>((groups, artifact) => {
    (groups[artifact.kind] ??= []).push(artifact);
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
            title={`Latest run · ${run.status}`}
            detail={`${new Date(run.windowStart).toLocaleDateString()} – ${new Date(run.windowEnd).toLocaleDateString()}`}
          />
          {Object.entries(groupedArtifacts ?? {}).map(([kind, artifacts]) => (
            <View key={kind} className="gap-3">
              <ListRow title={kind} />
              {artifacts.map((artifact) => (
                <ListRow
                  key={artifact.id}
                  title={artifact.title}
                  detail="Open artifact"
                  onPress={() => void openArtifact(artifact.id)}
                />
              ))}
            </View>
          ))}
          {openError ? <ErrorState message={openError} /> : null}
        </>
      ) : null}
      <Button onPress={() => void refetch()} variant="secondary">
        Refresh
      </Button>
    </Screen>
  );
}
