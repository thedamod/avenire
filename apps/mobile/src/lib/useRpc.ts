import { useCallback, useEffect, useRef, useState } from "react";
import { call, stream, type AvenireRpcClient } from "@avenire/client-runtime/rpc";
import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";
import { useApi } from "../state/api";

export function useQuery<T, E>(
  fn: (client: AvenireRpcClient) => Effect.Effect<T, E>,
  queryKey: string,
) {
  const runtime = useApi();
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);

  const refetch = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError(undefined);
    try {
      const result = await call(runtime, (client) => fnRef.current(client));
      if (generation.current === request) setData(result);
    } catch (cause) {
      if (generation.current === request) setError(cause);
    } finally {
      if (generation.current === request) setLoading(false);
    }
  }, [runtime, queryKey]);

  useEffect(() => {
    void refetch();
    return () => {
      generation.current += 1;
    };
  }, [refetch]);

  return { data, error, loading, refetch };
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
      onError: (error) => {
        if (active) errorRef.current?.(error);
      },
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [runtime, streamKey]);
}
