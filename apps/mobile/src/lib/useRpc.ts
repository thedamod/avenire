import { useCallback, useEffect, useRef, useState } from "react";
import {
  call,
  QueryRequest,
  subscribeLibraryProjection,
  stream,
  type AvenireRpcClient,
} from "@avenire/client-runtime/rpc";
import * as Cause from "effect/Cause";
import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";
import { useApi } from "../state/api";

/**
 * A reused keep-alive connection that the server just closed comes back as a body-less 200
 * ("Received empty HTTP response") on Android. Reads are safe to repeat; mutations use `call` directly.
 */
const droppedResponse = (cause: unknown) =>
  /empty HTTP response|ended before RPC request completed/.test(String(cause));

async function callWithRetry<T, E>(
  runtime: ReturnType<typeof useApi>,
  run: (client: AvenireRpcClient) => Effect.Effect<T, E>,
  signal: AbortSignal,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call(runtime, run, { signal });
    } catch (cause) {
      if (attempt >= 2 || signal.aborted || !droppedResponse(cause)) throw cause;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
}

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
  const request = useRef(new QueryRequest());

  const refetch = useCallback(
    () =>
      request.current.run(
        (signal) => callWithRetry(runtime, (client) => fnRef.current(client), signal),
        {
          start: () => {
            setLoading(true);
            setError(undefined);
          },
          success: setData,
          error: setError,
          finish: () => setLoading(false),
        },
      ),
    [runtime, queryKey],
  );

  useEffect(() => {
    void refetch();
    const unsubscribe = subscribeLibraryProjection(runtime, queryKey, () => {
      void refetch();
    });
    return () => {
      request.current.cancel();
      unsubscribe();
    };
  }, [refetch, runtime, queryKey]);

  return { data, error, loading, refetch, setData };
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
