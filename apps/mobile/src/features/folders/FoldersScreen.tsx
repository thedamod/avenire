import { ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, errorMessage } from "../../components/ErrorState";
import { ListRow } from "../../components/ListRow";
import { Screen } from "../../components/Screen";
import type { RootNavigation } from "../../navigation";
import { useQuery } from "../../lib/useRpc";

export function FoldersScreen() {
  const navigation = useNavigation<RootNavigation>();
  const {
    data: folders,
    error,
    loading,
    refetch,
  } = useQuery((client) => client["library.listFolders"](), "folders-list");

  return (
    <Screen title="Clusters" subtitle="Related material, grouped by topic.">
      {loading ? <ActivityIndicator /> : null}
      {error ? <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} /> : null}
      {!loading && !error && folders?.length === 0 ? (
        <EmptyState title="No clusters yet" description="Topics appear as your library grows." />
      ) : null}
      {folders?.map((folder) => (
        <ListRow
          key={folder.id}
          title={folder.name}
          detail={`${folder.fileCount} ${folder.fileCount === 1 ? "file" : "files"}${folder.suggested ? " · Suggested" : ""}`}
          onPress={() => navigation.navigate("Folder", { folderId: folder.id, name: folder.name })}
        />
      ))}
    </Screen>
  );
}
