/** Tracks acknowledgements, not requests. Failed/uncertain commands are never replayed. */
export class NativePresentationTracker {
  private epoch = 0;
  private readonly states = new Map<string, "pending" | "applied" | "failed">();
  private readonly pendingFailures = new Map<string, () => void>();

  reset(): void {
    this.epoch++;
    this.states.clear();
    this.pendingFailures.clear();
  }

  /** A native crash or changed view can arrive before rejected IPC promises. */
  invalidate(): void {
    for (const failed of this.pendingFailures.values()) failed();
    this.reset();
  }

  state(key: string): "pending" | "applied" | "failed" | undefined {
    return this.states.get(key);
  }

  apply(key: string, execute: () => Promise<unknown>, failed: () => void): void {
    if (this.states.has(key)) return;
    const epoch = this.epoch;
    this.states.set(key, "pending");
    this.pendingFailures.set(key, failed);
    void Promise.resolve()
      .then(() => (epoch === this.epoch ? execute() : undefined))
      .then(
        () => {
          if (epoch === this.epoch) {
            this.states.set(key, "applied");
            this.pendingFailures.delete(key);
          }
        },
        () => {
          if (epoch !== this.epoch) return;
          this.states.set(key, "failed");
          this.pendingFailures.delete(key);
          failed();
        },
      );
  }
}

/** Preserve the requested explanation when the local presentation cannot be acknowledged. */
export function nativePresentationFallback(output: {
  items?: ReadonlyArray<{ text?: string | undefined }>;
  scene?: { title: string };
  diagram?: { title: string; angleDegrees: number; cartPosition: number; poleLength: number };
}): string {
  const labels = output.items
    ?.map((item) => item.text?.trim())
    .filter(Boolean)
    .join("\n\n");
  if (labels) return labels;
  if (output.diagram) {
    const diagram = output.diagram;
    return `${diagram.title}: pole angle ${diagram.angleDegrees}°, cart position ${diagram.cartPosition}, pole length ${diagram.poleLength}.`;
  }
  if (output.scene)
    return `Requested figure: ${output.scene.title}. Ask for a text explanation to continue without the figure.`;
  return "The requested screen highlights could not be shown. Ask for a text explanation to continue.";
}
