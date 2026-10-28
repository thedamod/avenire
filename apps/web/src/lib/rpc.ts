"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import {
  call,
  subscribeLibraryProjection,
  stream,
  type AvenireRpcClient,
  type ClientRuntime,
} from "@avenire/client-runtime/rpc";
import * as Cause from "effect/Cause";
import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";

import { QueryCache, type QuerySnapshot } from "./query-cache";

const caches = new WeakMap<ClientRuntime, QueryCache>();

function cachedQuery<T, E>(
  runtime: ClientRuntime,
  queryKey: string,
  fn: (client: AvenireRpcClient) => Effect.Effect<T, E>,
) {
  let cache = caches.get(runtime);
  if (!cache) caches.set(runtime, (cache = new QueryCache()));
  return cache.get(
    queryKey,
    (signal) => call(runtime, fn, { signal }),
    (query) => subscribeLibraryProjection(runtime, queryKey, query.invalidate),
  );
}

/** Warm the same entry the page will read, with request deduplication and a freshness window. */
export function prefetchQuery<T, E>(
  runtime: ClientRuntime,
  fn: (client: AvenireRpcClient) => Effect.Effect<T, E>,
  queryKey: string,
) {
  return cachedQuery(runtime, queryKey, fn).fetch();
}

export const ApiContext = createContext<ClientRuntime | undefined>(undefined);

export function useApi(): ClientRuntime {
  const api = useContext(ApiContext);
  if (!api) throw new Error("The API provider is not ready.");
  return api;
}

export function useQuery<T, E>(
  fn: (client: AvenireRpcClient) => Effect.Effect<T, E>,
  queryKey: string,
) {
  const runtime = useApi();
  // The key defines resource identity; inline loaders change on every render.
  // eslint-disable-next-line react/memo-dependencies
  const query = useMemo(() => cachedQuery(runtime, queryKey, fn), [runtime, queryKey]);
  // Capture this render's loader so changing keys cannot redirect an older cached request.
  useEffect(() => {
    query.setLoader((signal) => call(runtime, fn, { signal }));
  });
  const snapshot = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot);
  const refetch = useCallback(() => query.fetch(true), [query]);

  useEffect(() => {
    void query.fetch();
    const refresh = () => {
      if (document.visibilityState === "visible") void query.fetch();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [query]);

  return { ...snapshot, refetch, setData: query.setData };
}

/**
 * The same cached query `useQuery` reads, followed from outside render (an effect that talks to
 * the desktop). Calls `onData` with each new value, `onError` when a fetch fails.
 */
export function watchQuery<T, E>(
  runtime: ClientRuntime,
  fn: (client: AvenireRpcClient) => Effect.Effect<T, E>,
  queryKey: string,
  onData: (data: T) => void,
  onError?: (error: unknown) => void,
): () => void {
  const query = cachedQuery(runtime, queryKey, fn);
  let last: QuerySnapshot<T> | undefined;
  const emit = () => {
    const snapshot = query.getSnapshot();
    if (snapshot === last) return;
    if (snapshot.data !== undefined && snapshot.data !== last?.data) onData(snapshot.data);
    if (snapshot.error !== undefined && snapshot.error !== last?.error) onError?.(snapshot.error);
    last = snapshot;
  };
  const unsubscribe = query.subscribe(emit);
  void query.fetch().then(emit);
  return unsubscribe;
}

export function useStream<T, E>(
  fn: (client: AvenireRpcClient) => Stream.Stream<T, E>,
  onEvent: (event: T) => void,
  streamKey: string,
  onError?: (error: unknown) => void,
) {
  const runtime = useApi();
  const fnRef = useRef(fn);
  const eventRef = useRef(onEvent);
  const errorRef = useRef(onError);
  fnRef.current = fn;
  eventRef.current = onEvent;
  errorRef.current = onError;

  useEffect(() => {
    let active = true;
    const unsubscribe = stream(runtime, (client) => fnRef.current(client), {
      onEvent: (event) => {
        if (active) eventRef.current(event);
      },
      // Hand callers the failure itself (a tagged error or defect), not the Cause,
      // so errorMessage() can read it.
      onError: (cause) => {
        if (active) errorRef.current?.(Cause.squash(cause));
      },
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [runtime, streamKey]);
}

export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Something went wrong. Please try again.";
}

/** Refresh cached resource families, including inactive pages on their next visit. */
export function invalidateQueries(runtime: ClientRuntime, matches: (key: string) => boolean) {
  caches.get(runtime)?.invalidateWhere(matches);
}
