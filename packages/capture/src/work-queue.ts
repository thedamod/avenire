/** Reserve one slot for small work; aging admits large work even under continuous small arrivals. */
export class SourceWorkQueue {
  private active = 0;
  private large = 0;
  private pending: Array<{ size: number; at: number; start: () => void }> = [];
  private readonly limit: number;
  private readonly smallBytes: number;
  constructor(limit = 3, smallBytes = 8 * 1024 * 1024) {
    this.limit = limit;
    this.smallBytes = smallBytes;
  }
  run<A>(size: number, task: () => Promise<A>): Promise<A> {
    return new Promise<A>((resolve, reject) => {
      this.pending.push({
        size,
        at: Date.now(),
        start: () => {
          this.active++;
          if (size > this.smallBytes) this.large++;
          void Promise.resolve()
            .then(task)
            .then(resolve, reject)
            .finally(() => {
              this.active--;
              if (size > this.smallBytes) this.large--;
              this.drain();
            });
        },
      });
      this.drain();
    });
  }
  private drain() {
    while (this.active < this.limit) {
      const index = this.pending.findIndex(
        (work) => work.size <= this.smallBytes || this.large < Math.max(1, this.limit - 1),
      );
      if (index < 0) return;
      const aged = this.pending.findIndex(
        (work) =>
          Date.now() - work.at >= 5000 &&
          (work.size <= this.smallBytes || this.large < Math.max(1, this.limit - 1)),
      );
      this.pending.splice(aged >= 0 ? aged : index, 1)[0]!.start();
    }
  }
}
