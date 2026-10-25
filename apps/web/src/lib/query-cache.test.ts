import { describe, expect, it, vi } from "vite-plus/test";
import { CachedQuery, QueryCache, QUERY_STALE_MS } from "./query-cache";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("query cache", () => {
  it("shares one request between prefetch and subscribers, including across navigation", async () => {
    const cache = new QueryCache();
    const result = deferred<string>();
    const load = vi.fn(() => result.promise);
    const attach = vi.fn(() => () => {});
    const query = cache.get("notebook:one", load, attach);
    const pending = query.fetch();
    const same = cache.get("notebook:one", load, attach);
    expect(same).toBe(query);
    expect(same.fetch()).toBe(pending);
    const unsubscribe = same.subscribe(() => {});
    unsubscribe();
    result.resolve("saved");
    await pending;
    expect(same.getSnapshot().data).toBe("saved");
    await same.fetch();
    expect(load).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledTimes(1);
  });

  it("shows stale data during refresh and retains it when the network fails", async () => {
    const query = new CachedQuery(async () => "cached");
    await query.fetch();
    query.load = async () => {
      throw new Error("offline");
    };
    const pending = query.fetch(true);
    expect(query.getSnapshot()).toMatchObject({ data: "cached", loading: true });
    await pending;
    expect(query.getSnapshot()).toMatchObject({ data: "cached", loading: false });
    expect(query.getSnapshot().error).toBeInstanceOf(Error);
  });

  it("does not let an old fetch overwrite an optimistic edit", async () => {
    const old = deferred<string>();
    const query = new CachedQuery(() => old.promise);
    const pending = query.fetch();
    await Promise.resolve();
    query.setData("renamed");
    old.resolve("old title");
    await pending;
    expect(query.getSnapshot().data).toBe("renamed");
  });

  it.each(["NotFound", "Unauthorized"])("removes cached data on %s", async (_tag) => {
    const query = new CachedQuery(async () => "private data");
    await query.fetch();
    query.load = async () => {
      throw { _tag };
    };
    await query.fetch(true);
    expect(query.getSnapshot().data).toBeUndefined();
    expect(query.getSnapshot().error).toEqual({ _tag });
  });

  it("invalidates inactive entries and fences out reads started before a mutation", async () => {
    const old = deferred<string>();
    const query = new CachedQuery(() => old.promise);
    const pending = query.fetch();
    await Promise.resolve();
    query.invalidate();
    query.load = async () => "after mutation";
    await query.fetch();
    old.resolve("before mutation");
    await pending;
    expect(query.getSnapshot().data).toBe("after mutation");
  });

  it("refreshes active queries on invalidation and notifies every subscriber", async () => {
    let value = "before";
    const query = new CachedQuery(async () => value);
    await query.fetch();
    const first = vi.fn();
    const second = vi.fn();
    query.subscribe(first);
    query.subscribe(second);
    value = "after";
    query.invalidate();
    await query.fetch();
    expect(query.getSnapshot().data).toBe("after");
    expect(first).toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(first.mock.calls.length);
  });

  it("revalidates after the freshness window and keeps different owners and keys separate", async () => {
    const clock = vi.spyOn(Date, "now");
    try {
      clock.mockReturnValue(100_000);
      const cache = new QueryCache();
      const load = vi.fn(async () => "one");
      const attach = () => () => {};
      const query = cache.get("one", load, attach);
      await query.fetch();
      clock.mockReturnValue(100_000 + QUERY_STALE_MS + 1);
      await query.fetch();
      expect(load).toHaveBeenCalledTimes(2);
      expect(cache.get("two", load, attach).getSnapshot().data).toBeUndefined();
      expect(new QueryCache().get("one", load, attach).getSnapshot().data).toBeUndefined();
    } finally {
      clock.mockRestore();
    }
  });

  it("disposes old inactive subscriptions while preserving active entries", () => {
    const cache = new QueryCache();
    const dispose = vi.fn();
    const attach = () => dispose;
    const load = async () => "data";
    const active = cache.get("active", load, attach);
    active.subscribe(() => {});
    for (let index = 0; index < 105; index++) cache.get(`key:${index}`, load, attach);
    expect(dispose).toHaveBeenCalled();
    expect(cache.get("active", load, attach)).toBe(active);
  });
});
