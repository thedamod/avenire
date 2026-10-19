/** Owns cancellation and result ordering independently of React/native presentation. */
export class QueryRequest {
  private generation = 0;
  private controller: AbortController | undefined;

  cancel(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = undefined;
  }

  async run<T>(
    load: (signal: AbortSignal) => Promise<T>,
    publish: {
      start: () => void;
      success: (value: T) => void;
      error: (cause: unknown) => void;
      finish: () => void;
    },
  ): Promise<void> {
    this.cancel();
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    publish.start();
    try {
      const value = await load(controller.signal);
      if (generation === this.generation) publish.success(value);
    } catch (cause) {
      if (generation === this.generation) publish.error(cause);
    } finally {
      if (generation === this.generation) publish.finish();
    }
  }
}
