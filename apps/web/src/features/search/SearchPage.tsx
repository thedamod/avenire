"use client";

import { useEffect, useMemo, useState } from "react";
import type { FileKind, SearchHit } from "@avenire/contracts";
import { call } from "@avenire/client-runtime/rpc";
import { Input } from "@avenire/ui/components/input";
import { useApi, errorMessage } from "~/lib/rpc";

const kinds: ReadonlyArray<FileKind> = [
  "pdf",
  "document",
  "web-page",
  "video",
  "audio",
  "image",
  "note",
  "selection",
];

function location(hit: SearchHit): string {
  if (hit.location.page !== undefined) return `Page ${hit.location.page}`;
  if (hit.location.startSec !== undefined)
    return `${Math.floor(hit.location.startSec / 60)}:${Math.floor(hit.location.startSec % 60)
      .toString()
      .padStart(2, "0")}`;
  return hit.location.heading ?? hit.chunkKind;
}

export function SearchPage() {
  const api = useApi();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<FileKind | "all">("all");
  const [hits, setHits] = useState<ReadonlyArray<SearchHit>>([]);
  const [abstained, setAbstained] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    const text = query.trim();
    let active = true;
    if (!text) {
      setHits([]);
      setAbstained(false);
      setLoading(false);
      setError(undefined);
      return () => {
        active = false;
      };
    }
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(undefined);
      void call(api, (client) =>
        client["search.query"]({ text, limit: 30, ...(kind === "all" ? {} : { kinds: [kind] }) }),
      )
        .then((results) => {
          if (active) {
            setHits(results.hits);
            setAbstained(results.abstained);
          }
        })
        .catch((cause: unknown) => {
          if (active) setError(errorMessage(cause));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 280);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [api, query, kind]);

  const grouped = useMemo(() => {
    const groups = new Map<string, SearchHit[]>();
    for (const hit of hits) {
      const group = groups.get(hit.fileId) ?? [];
      group.push(hit);
      groups.set(hit.fileId, group);
    }
    return [...groups.entries()];
  }, [hits]);

  return (
    <section className="mx-auto max-w-4xl p-6">
      <header className="border-b border-border pb-4">
        <h1 className="text-lg font-semibold">Search</h1>
      </header>
      <div className="my-5 flex gap-3">
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search your material"
          aria-label="Search your material"
        />
        <select
          aria-label="Filter by kind"
          className="h-9 border border-input bg-background px-3 text-sm"
          value={kind}
          onChange={(event) =>
            setKind(kinds.find((value) => value === event.target.value) ?? "all")
          }
        >
          <option value="all">All kinds</option>
          {kinds.map((fileKind) => (
            <option key={fileKind} value={fileKind}>
              {fileKind}
            </option>
          ))}
        </select>
      </div>
      {loading ? <p className="py-4 text-sm text-muted-foreground">Searching…</p> : null}
      {error ? (
        <p role="alert" className="py-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {!loading && !error && query.trim() && hits.length === 0 ? (
        <p className="py-8 text-sm text-muted-foreground">
          {abstained ? "Nothing in your materials matches this." : "No results found."}
        </p>
      ) : null}
      <div className="divide-y divide-border">
        {grouped.map(([fileId, fileHits]) => (
          <article key={fileId} className="py-4">
            <h2 className="font-medium">{fileHits[0]?.fileTitle}</h2>
            <div className="mt-2 grid gap-3">
              {fileHits.map((hit) => (
                <div key={hit.chunkId} className="border-l-2 border-border pl-3">
                  <p className="text-sm leading-6">
                    {hit.content.trim().replace(/\s+/g, " ").slice(0, 300)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {location(hit)} · {hit.fileKind}
                  </p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
