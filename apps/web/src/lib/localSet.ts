"use client";

import { useCallback, useSyncExternalStore } from "react";

// Small persisted string sets (e.g. sources the user chose to keep), shared across components.
const caches = new Map<string, ReadonlySet<string>>();
const listeners = new Map<string, Set<() => void>>();
const EMPTY: ReadonlySet<string> = new Set();

function read(key: string): ReadonlySet<string> {
  let cached = caches.get(key);
  if (!cached) {
    try {
      cached = new Set(JSON.parse(localStorage.getItem(key) ?? "[]") as string[]);
    } catch {
      cached = new Set();
    }
    caches.set(key, cached);
  }
  return cached;
}

export function addToLocalSet(key: string, values: readonly string[]) {
  const next = new Set(read(key));
  for (const value of values) next.add(value);
  caches.set(key, next);
  try {
    localStorage.setItem(key, JSON.stringify([...next].slice(-500)));
  } catch {
    // Storage full or disabled: the set still lives for this session.
  }
  for (const listener of listeners.get(key) ?? []) listener();
}

export function useLocalSet(key: string): ReadonlySet<string> {
  const subscribe = useCallback(
    (listener: () => void) => {
      let set = listeners.get(key);
      if (!set) listeners.set(key, (set = new Set()));
      set.add(listener);
      return () => set.delete(listener);
    },
    [key],
  );
  return useSyncExternalStore(
    subscribe,
    () => read(key),
    () => EMPTY,
  );
}
