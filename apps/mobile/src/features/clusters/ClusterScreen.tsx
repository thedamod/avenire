import { ActivityIndicator } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, errorMessage } from "../../components/ErrorState";
import { ListRow } from "../../components/ListRow";
import { Screen } from "../../components/Screen";
import type { RootStackParamList } from "../../navigation";
import { useQuery } from "../../lib/useRpc";

type Props = NativeStackScreenProps<RootStackParamList, "Cluster">;

export function ClusterScreen({ route }: Props) {
  const { clusterId, name } = route.params;
  const {
    data: items,
    error,
    loading,
    refetch,
  } = useQuery(
    (client) => client["library.listItems"]({ clusterId }),
    `cluster-items:${clusterId}`,
  );

  return (
    <Screen title={name} subtitle="Material filed in this cluster.">
      {loading ? <ActivityIndicator /> : null}
      {error ? <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} /> : null}
      {!loading && !error && items?.length === 0 ? (
        <EmptyState title="No material in this cluster" />
      ) : null}
      {items?.map((item) => (
        <ListRow key={item.id} title={item.title} detail={item.kind} />
      ))}
    </Screen>
  );
}
