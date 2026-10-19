import { ActivityIndicator } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, errorMessage } from "../../components/ErrorState";
import { ListRow } from "../../components/ListRow";
import { Screen } from "../../components/Screen";
import type { RootStackParamList } from "../../navigation";
import { useQuery } from "../../lib/useRpc";

type Props = NativeStackScreenProps<RootStackParamList, "Folder">;

export function FolderScreen({ route }: Props) {
  const { folderId, name } = route.params;
  const {
    data: files,
    error,
    loading,
    refetch,
  } = useQuery((client) => client["library.listFiles"]({ folderId }), `folder-files:${folderId}`);

  return (
    <Screen title={name} subtitle="Material filed in this cluster.">
      {loading ? <ActivityIndicator /> : null}
      {error ? <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} /> : null}
      {!loading && !error && files?.length === 0 ? (
        <EmptyState title="No material in this cluster" />
      ) : null}
      {files?.map((file) => (
        <ListRow key={file.id} title={file.title} detail={file.kind} />
      ))}
    </Screen>
  );
}
