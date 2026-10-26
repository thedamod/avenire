/** The acquisition layer checks the same open file before and after spooling. */
export class HashLru {
  private readonly entries = new Map<string, string>();
  private readonly capacity: number;
  constructor(capacity = 128) {
    this.capacity = capacity;
  }
  private key(path: string, size: number, mtime: number) {
    return JSON.stringify([path, size, mtime]);
  }
  get(path: string, size: number, mtime: number): string | undefined {
    const key = this.key(path, size, mtime);
    const value = this.entries.get(key);
    if (value) {
      this.entries.delete(key);
      this.entries.set(key, value);
    }
    return value;
  }
  set(path: string, size: number, mtime: number, sha256: string): void {
    const key = this.key(path, size, mtime);
    this.entries.delete(key);
    this.entries.set(key, sha256);
    while (this.entries.size > this.capacity)
      this.entries.delete(this.entries.keys().next().value!);
  }
}

export async function mapConcurrent<A, B>(
  items: readonly A[],
  limit: number,
  run: (item: A, index: number) => Promise<B>,
): Promise<B[]> {
  const results: B[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const index = next++;
        if (index >= items.length) return;
        results[index] = await run(items[index]!, index);
      }
    }),
  );
  return results;
}

/** Shared across native and extension uploads, including overlapping fill-in branches. */
export class UploadGate {
  private active = 0;
  private readonly waiting: Array<() => void> = [];
  private readonly limit: number;
  constructor(limit = 3) {
    this.limit = limit;
  }
  async run<A>(task: () => Promise<A>): Promise<A> {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.waiting.push(resolve));
    else this.active++;
    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
}
