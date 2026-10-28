"use client";
import { useEffect, useEffectEvent } from "react";
import type { IngestionJob } from "@avenire/contracts";
import { stream, updateLatestJob, type ClientRuntime } from "@avenire/client-runtime/rpc";
import { useApi } from "~/lib/rpc";

type Listener = (job: IngestionJob) => void;
const subscriptions = new WeakMap<
  ClientRuntime,
  {
    listeners: Set<Listener>;
    latest: ReadonlyMap<IngestionJob["fileId"], IngestionJob>;
    stop: () => void;
  }
>();

/** One server watch per signed-in runtime, shared by Sources and the upload toast. */
export function useIngestionStream(onJob: Listener) {
  const runtime = useApi();
  const onEvent = useEffectEvent(onJob);
  useEffect(() => {
    let subscription = subscriptions.get(runtime);
    if (!subscription) {
      subscription = { listeners: new Set(), latest: new Map(), stop: () => {} };
      subscriptions.set(runtime, subscription);
      const state = subscription;
      let stopped = false,
        retry = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let cancel = () => {};
      const connect = () => {
        cancel = stream(runtime, (client) => client["library.watchIngestion"](), {
          onEvent: (job) => {
            retry = 0;
            const next = updateLatestJob(state.latest, job);
            if (next === state.latest) return;
            state.latest = next;
            for (const listener of state.listeners) listener(job);
          },
          onError: () => {
            if (!stopped) timer = setTimeout(connect, Math.min(30_000, 500 * 2 ** retry++));
          },
        });
      };
      connect();
      state.stop = () => {
        stopped = true;
        clearTimeout(timer);
        cancel();
      };
    }
    const listener: Listener = (job) => onEvent(job);
    subscription.listeners.add(listener);
    for (const job of subscription.latest.values()) listener(job);
    return () => {
      subscription.listeners.delete(listener);
      if (!subscription.listeners.size) {
        subscription.stop();
        subscriptions.delete(runtime);
      }
    };
  }, [runtime]);
}
