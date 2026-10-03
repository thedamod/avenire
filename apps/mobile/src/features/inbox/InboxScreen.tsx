import { useState } from "react";
import { ActivityIndicator } from "react-native";
import type { IngestionJob } from "@avenire/contracts";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, errorMessage } from "../../components/ErrorState";
import { ListRow } from "../../components/ListRow";
import { Screen } from "../../components/Screen";
import { useQuery, useStream } from "../../lib/useRpc";

export function InboxScreen() {
  const {
    data: items,
    error,
    loading,
    refetch,
  } = useQuery((client) => client["library.listItems"]({ placement: "inbox" }), "inbox-items");
  const [jobsById, setJobsById] = useState<ReadonlyMap<IngestionJob["id"], IngestionJob>>(
    () => new Map(),
  );
  const [streamError, setStreamError] = useState<string>();

  useStream(
    (client) => client["library.watchIngestion"](),
    (job) => {
      setJobsById((previous) => new Map(previous).set(job.id, job));
      setStreamError(undefined);
    },
    "inbox-ingestion-watch",
    (cause) => setStreamError(errorMessage(cause)),
  );

  const statusByItem = new Map(
    [...jobsById.values()].map((job) => [job.itemId, job.status] as const),
  );

  return (
    <Screen title="Inbox" subtitle="New material being prepared for your library.">
      {loading ? <ActivityIndicator /> : null}
      {error ? <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} /> : null}
      {streamError ? <ErrorState message={`Live updates stopped: ${streamError}`} /> : null}
      {!loading && !error && items?.length === 0 ? (
        <EmptyState title="Your inbox is clear" description="New captures will show up here." />
      ) : null}
      {items?.map((item) => (
        <ListRow
          key={item.id}
          title={item.title}
          detail={statusByItem.get(item.id) ?? "Waiting for ingestion"}
        />
      ))}
    </Screen>
  );
}
