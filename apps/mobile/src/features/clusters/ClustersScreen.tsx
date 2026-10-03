import { ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, errorMessage } from "../../components/ErrorState";
import { ListRow } from "../../components/ListRow";
import { Screen } from "../../components/Screen";
import type { RootNavigation } from "../../navigation";
import { useQuery } from "../../lib/useRpc";

export function ClustersScreen() {
  const navigation = useNavigation<RootNavigation>();
  const {
    data: clusters,
    error,
    loading,
    refetch,
  } = useQuery((client) => client["library.listClusters"](), "clusters-list");

  return (
    <Screen title="Clusters" subtitle="Related material, grouped by topic.">
      {loading ? <ActivityIndicator /> : null}
      {error ? <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} /> : null}
      {!loading && !error && clusters?.length === 0 ? (
        <EmptyState title="No clusters yet" description="Topics appear as your library grows." />
      ) : null}
      {clusters?.map((cluster) => (
        <ListRow
          key={cluster.id}
          title={cluster.name}
          detail={`${cluster.itemCount} ${cluster.itemCount === 1 ? "item" : "items"}${cluster.suggested ? " · Suggested" : ""}`}
          onPress={() =>
            navigation.navigate("Cluster", { clusterId: cluster.id, name: cluster.name })
          }
        />
      ))}
    </Screen>
  );
}
