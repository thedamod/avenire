"use client";

import { cn } from "@avenire/ui/lib/utils";
import { relativeLabel, type RelativeStyle } from "~/lib/time";
import { useNow } from "~/lib/useNow";

/** "Today", "Yesterday", "2d ago" (format `day`) or "Just now", "2h ago" (`precise`), "5:48 AM" / "Mon" (`clock`). */
export function RelativeTime({
  iso,
  format = "precise",
  className,
}: {
  iso: string | null | undefined;
  format?: RelativeStyle;
  className?: string;
}) {
  const now = useNow();
  if (!iso) return null;
  return (
    <time
      dateTime={iso}
      title={new Date(iso).toLocaleString()}
      className={cn(
        "shrink-0 text-[12.5px] whitespace-nowrap text-muted-foreground tabular-nums",
        className,
      )}
    >
      {relativeLabel(iso, format, new Date(now))}
    </time>
  );
}
