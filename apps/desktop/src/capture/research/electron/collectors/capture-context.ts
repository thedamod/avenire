export type CaptureContext = {
  notes: string[];
  // Memoize an async computation for the lifetime of ONE snapshot, so
  // collectors running in parallel share one spawn/FS read instead of
  // repeating it. Same key → same promise (also while in flight).
  memo<T>(key: string, fn: () => Promise<T>): Promise<T>;
};

export function createCaptureContext(notes: string[] = []): CaptureContext {
  const cache = new Map<string, Promise<unknown>>();
  return {
    notes,
    memo<T>(key: string, fn: () => Promise<T>): Promise<T> {
      const hit = cache.get(key);
      if (hit) return hit as Promise<T>;
      // Wrapped so a synchronous throw in fn is a rejected promise too, and
      // the rejection is cached (a failing spawn is not retried per collector).
      const p = (async () => fn())();
      cache.set(key, p);
      return p;
    },
  };
}
