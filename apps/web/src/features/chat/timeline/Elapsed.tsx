"use client";

import { useEffect, useState } from "react";

/** "12s", "1m 08s", "1h 02m". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m ${String(total % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/**
 * A live elapsed label. Isolated so the one-second tick re-renders only this text, never the
 * row around it.
 */
export function Elapsed({
  since,
  until,
}: {
  readonly since: number;
  readonly until?: number | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  const live = until === null || until === undefined;
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [live]);
  return <span className="tabular-nums">{formatDuration((until ?? now) - since)}</span>;
}
