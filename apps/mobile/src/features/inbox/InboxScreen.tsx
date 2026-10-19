import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator } from "react-native";
import type { FileId, IngestionJob } from "@avenire/contracts";
import { invalidateLibrary, pruneJobs, updateLatestJob } from "@avenire/client-runtime/rpc";
import { useApi } from "../../state/api";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, errorMessage } from "../../components/ErrorState";
import { ListRow } from "../../components/ListRow";
import { Screen } from "../../components/Screen";
import { useQuery, useStream } from "../../lib/useRpc";

export function InboxScreen() {
  const api = useApi();
  const {
    data: files,
    error,
    loading,
    refetch,
  } = useQuery((client) => client["library.listFiles"]({ placement: "inbox" }), "inbox-files");
  const [jobsByFile, setJobsByFile] = useState<ReadonlyMap<FileId, IngestionJob>>(() => new Map());
  const visibleFiles = useMemo(
    () => (files ? new Set(files.map((file) => file.id)) : undefined),
    [files],
  );
  useEffect(() => {
    if (visibleFiles) setJobsByFile((previous) => pruneJobs(previous, visibleFiles));
  }, [visibleFiles]);
  const [streamError, setStreamError] = useState<string>();

  useStream(
    (client) => client["library.watchIngestion"](),
    (job) => {
      setJobsByFile((previous) => updateLatestJob(previous, job, visibleFiles));
      if (job.status === "indexed") invalidateLibrary(api);
      setStreamError(undefined);
    },
    "inbox-ingestion-watch",
    (cause) => setStreamError(errorMessage(cause)),
  );

  return (
    <Screen title="Inbox" subtitle="New material being prepared for your library.">
      {loading ? <ActivityIndicator /> : null}
      {error ? <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} /> : null}
      {streamError ? <ErrorState message={`Live updates stopped: ${streamError}`} /> : null}
      {!loading && !error && files?.length === 0 ? (
        <EmptyState title="Your inbox is clear" description="New captures will show up here." />
      ) : null}
      {files?.map((file) => (
        <ListRow
          key={file.id}
          title={file.title}
          detail={jobsByFile.get(file.id)?.status ?? "Waiting for ingestion"}
        />
      ))}
    </Screen>
  );
}
