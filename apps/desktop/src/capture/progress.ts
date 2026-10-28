import type { CaptureProgress, CaptureStarted } from "../bridge.ts";

/** Retained for reload replay; only the final receipt can be acknowledged. */
export class CaptureProgressStream {
  readonly events: CaptureProgress[] = [];
  private seq = 0;
  private readonly statuses = new Map<string, CaptureProgress["status"]>();
  readonly started: CaptureStarted;
  private readonly send: (channel: string, value: CaptureStarted | CaptureProgress) => void;
  constructor(
    started: CaptureStarted,
    send: (channel: string, value: CaptureStarted | CaptureProgress) => void,
  ) {
    this.started = started;
    this.send = send;
    for (const item of started.items) this.statuses.set(item.key, "pending");
    send("avenire:capture-started", started);
  }
  progress(event: Omit<CaptureProgress, "id" | "seq">) {
    const previous = this.statuses.get(event.key);
    if (previous === "saved" || previous === "skipped" || previous === "failed") return;
    if (previous === "uploading" && event.status === "pending") return;
    this.statuses.set(event.key, event.status);
    const value = { ...event, id: this.started.id, seq: ++this.seq };
    this.events.push(value);
    this.send("avenire:capture-progress", value);
  }
  settled(key: string) {
    const status = this.statuses.get(key);
    return status === "saved" || status === "skipped" || status === "failed";
  }
  replay(send: (channel: string, value: CaptureStarted | CaptureProgress) => void) {
    send("avenire:capture-started", this.started);
    for (const event of this.events) send("avenire:capture-progress", event);
  }
}
