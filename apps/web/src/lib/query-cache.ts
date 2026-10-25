export const QUERY_STALE_MS = 30_000;

export interface QuerySnapshot<T> {
  readonly data: T | undefined;
  readonly error: unknown;
  readonly loading: boolean;
}

/** A shared request survives page navigation; writes fence out older network responses. */
export class CachedQuery<T> {
  private snapshot: QuerySnapshot<T> = { data: undefined, error: undefined, loading: true };
  private readonly listeners = new Set<() => void>();
  private pending: Promise<void> | undefined;
  private controller: AbortController | undefined;
  private updatedAt = 0;
  private loaded = false;
  load: (signal: AbortSignal) => Promise<T>;
  touchedAt = Date.now();
  dispose = () => {};

  constructor(load: (signal: AbortSignal) => Promise<T>) {
    this.load = load;
  }

  setLoader(load: (signal: AbortSignal) => Promise<T>) {
    this.load = load;
  }

  getSnapshot = () => this.snapshot;
  get active() {
    return this.listeners.size > 0;
  }
  get fetching() {
    return this.pending !== undefined;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish(patch: Partial<QuerySnapshot<T>>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  private cancel() {
    this.controller?.abort();
    this.controller = undefined;
    this.pending = undefined;
  }

  setData = (value: T | undefined | ((previous: T | undefined) => T | undefined)) => {
    const data =
      typeof value === "function"
        ? (value as (previous: T | undefined) => T | undefined)(this.snapshot.data)
        : value;
    this.cancel();
    this.loaded = data !== undefined;
    this.updatedAt = Date.now();
    this.publish({ data, error: undefined, loading: false });
  };

  invalidate = () => {
    this.cancel();
    this.updatedAt = 0;
    this.publish({ loading: !this.loaded });
    if (this.active) void this.fetch(true);
  };

  fetch = (force = false): Promise<void> => {
    this.touchedAt = Date.now();
    if (this.pending) return this.pending;
    if (!force && this.loaded && Date.now() - this.updatedAt < QUERY_STALE_MS)
      return Promise.resolve();
    const controller = new AbortController();
    this.controller = controller;
    this.publish({ loading: true, error: undefined });
    this.pending = Promise.resolve()
      .then(() => this.load(controller.signal))
      .then(
        (data) => {
          if (this.controller !== controller) return;
          this.loaded = true;
          this.updatedAt = Date.now();
          this.publish({ data, error: undefined });
        },
        (error: unknown) => {
          if (this.controller !== controller) return;
          const tag = (error as { _tag?: string } | null)?._tag;
          if (tag === "NotFound" || tag === "Unauthorized") {
            this.loaded = false;
            this.updatedAt = 0;
            this.publish({ data: undefined, error });
          } else this.publish({ error });
        },
      )
      .finally(() => {
        if (this.controller !== controller) return;
        this.pending = undefined;
        this.controller = undefined;
        this.publish({ loading: false });
      });
    return this.pending;
  };
}

/** Per-runtime memory cache; prune old inactive entries on access, targeting 100 entries. */
export class QueryCache {
  private readonly entries = new Map<string, CachedQuery<unknown>>();

  invalidateWhere(matches: (key: string) => boolean) {
    for (const [key, query] of this.entries) if (matches(key)) query.invalidate();
  }

  get<T>(
    key: string,
    load: (signal: AbortSignal) => Promise<T>,
    attach: (query: CachedQuery<T>) => () => void,
  ) {
    let query = this.entries.get(key) as CachedQuery<T> | undefined;
    if (!query) {
      query = new CachedQuery(load);
      query.dispose = attach(query);
      this.entries.set(key, query as CachedQuery<unknown>);
    }
    query.touchedAt = Date.now();
    const inactive = [...this.entries]
      .filter(([entryKey, entry]) => entryKey !== key && !entry.active && !entry.fetching)
      .sort((a, b) => a[1].touchedAt - b[1].touchedAt);
    for (const [entryKey, entry] of inactive) {
      if (this.entries.size <= 100 && Date.now() - entry.touchedAt < 600_000) break;
      entry.dispose();
      this.entries.delete(entryKey);
    }
    return query;
  }
}
