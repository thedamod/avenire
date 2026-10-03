import { useEffect, useState } from "react";
import { TextInput } from "react-native";
import { call } from "@avenire/client-runtime/rpc";
import type { SearchHit } from "@avenire/contracts";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, errorMessage } from "../../components/ErrorState";
import { ListRow } from "../../components/ListRow";
import { Screen } from "../../components/Screen";
import { useApi } from "../../state/api";

function formatSnippet(content: string): string {
  const normalized = content.trim().replace(/\s+/g, " ");
  return normalized.length > 240 ? `${normalized.slice(0, 237)}…` : normalized;
}

function formatLocation(hit: SearchHit): string {
  if (hit.location.page !== undefined) return `Page ${hit.location.page}`;
  if (hit.location.startSec !== undefined) {
    const minutes = Math.floor(hit.location.startSec / 60);
    const seconds = Math.floor(hit.location.startSec % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }
  return hit.chunkKind;
}

export function SearchScreen() {
  const api = useApi();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ReadonlyArray<SearchHit>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const text = query.trim();
    let active = true;
    if (!text) {
      setHits([]);
      setError(undefined);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    const timer = setTimeout(() => {
      setLoading(true);
      setError(undefined);
      void call(api, (client) => client["search.query"]({ text, limit: 20 }))
        .then((results) => {
          if (active) setHits(results);
        })
        .catch((cause: unknown) => {
          if (active) setError(errorMessage(cause));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, query]);

  return (
    <Screen title="Search" subtitle="Find a passage across your study material.">
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search your material"
        returnKeyType="search"
        className="rounded-xl border border-border bg-card px-4 py-3 text-foreground"
      />
      {loading ? <ListRow title="Searching…" /> : null}
      {error ? <ErrorState message={error} /> : null}
      {!loading && !error && query.trim() && hits.length === 0 ? (
        <EmptyState title="No results found" description="Try a different word or phrase." />
      ) : null}
      {hits.map((hit) => (
        <ListRow
          key={hit.chunkId}
          title={hit.itemTitle}
          detail={`${formatSnippet(hit.content)}\n\n${formatLocation(hit)}`}
        />
      ))}
    </Screen>
  );
}
