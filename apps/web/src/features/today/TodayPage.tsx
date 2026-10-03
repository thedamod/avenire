"use client";

import { useMemo, useState } from "react";
import type { Artifact, ArtifactId } from "@avenire/contracts";
import { call } from "@avenire/client-runtime/rpc";
import { Button } from "@avenire/ui/components/button";
import { useApi, useQuery, errorMessage } from "~/lib/rpc";

export function TodayPage() {
  const api = useApi();
  const {
    data: runs,
    loading,
    error,
    refetch,
  } = useQuery((client) => client["cloud.listRuns"]({ limit: 1 }), "today-latest-run");
  const [actionError, setActionError] = useState<string>();
  const [running, setRunning] = useState(false);
  const run = runs?.[0];
  const grouped = useMemo(() => {
    const groups = new Map<string, Artifact[]>();
    for (const artifact of run?.artifacts ?? []) {
      const list = groups.get(artifact.kind) ?? [];
      list.push(artifact);
      groups.set(artifact.kind, list);
    }
    return [...groups.entries()];
  }, [run]);

  async function openArtifact(artifactId: ArtifactId) {
    setActionError(undefined);
    try {
      const result = await call(api, (client) => client["cloud.artifactUrl"]({ artifactId }));
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (cause) {
      setActionError(errorMessage(cause));
    }
  }

  async function runNow() {
    setRunning(true);
    setActionError(undefined);
    try {
      await call(api, (client) => client["cloud.runNow"]());
      await refetch();
    } catch (cause) {
      const message = errorMessage(cause);
      setActionError(
        /conflict|already ran|already exists/i.test(message)
          ? "Ruth Cloud already ran today."
          : message,
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="mx-auto max-w-4xl p-6">
      <header className="flex items-center justify-between border-b border-border pb-4">
        <h1 className="text-lg font-semibold">Today</h1>
        <Button onClick={() => void runNow()} disabled={running}>
          {running ? "Starting…" : "Run now"}
        </Button>
      </header>
      {loading ? <p className="py-6 text-sm text-muted-foreground">Loading Ruth Cloud…</p> : null}
      {error ? (
        <p role="alert" className="py-4 text-sm text-destructive">
          {errorMessage(error)}{" "}
          <button className="underline" onClick={() => void refetch()}>
            Retry
          </button>
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="py-4 text-sm text-destructive">
          {actionError}
        </p>
      ) : null}
      {!loading && !error && !run ? (
        <p className="py-8 text-sm text-muted-foreground">
          No Ruth Cloud run yet. Your study artifacts will appear here after the next run.
        </p>
      ) : null}
      {run ? (
        <>
          <section className="border-b border-border py-5">
            <h2 className="font-medium">Latest run · {run.status}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {new Date(run.windowStart).toLocaleString()} –{" "}
              {new Date(run.windowEnd).toLocaleString()}
            </p>
            {run.error ? <p className="mt-2 text-sm text-destructive">{run.error}</p> : null}
          </section>
          {grouped.map(([kind, artifacts]) => (
            <section key={kind} className="border-b border-border py-5">
              <h2 className="font-medium capitalize">{kind}</h2>
              <ul className="mt-2 divide-y divide-border">
                {artifacts.map((artifact) => (
                  <li key={artifact.id} className="flex items-center justify-between py-3">
                    <span className="text-sm">{artifact.title}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void openArtifact(artifact.id)}
                    >
                      Open
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      ) : null}
    </section>
  );
}
