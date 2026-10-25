"use client";
import type { RefObject } from "react";

export type OfficeViewProps = {
  url: string;
  /** File name with the right extension: renderers sniff the format from it. */
  name: string;
  q: string | undefined;
  page?: number | undefined;
  compact: boolean;
  target: RefObject<HTMLDivElement | null>;
  onRetry?: (() => void) | undefined;
};

export function OfficeLoading({ label = "Loading document" }: { label?: string }) {
  return (
    <div className="flex flex-1 flex-col gap-3.5 p-6" aria-label={label}>
      {["90%", "100%", "80%", "95%", "50%"].map((width, index) => (
        <span key={index} className="h-3 animate-pulse rounded bg-surface-4" style={{ width }} />
      ))}
    </div>
  );
}

/** The bytes couldn't be fetched or rendered: say so, and offer a retry and the file itself. */
export function OfficeFailure({
  message,
  url,
  onRetry,
}: {
  message: string;
  url: string;
  onRetry?: (() => void) | undefined;
}) {
  return (
    <div
      role="alert"
      className="flex min-h-60 flex-1 flex-col items-center justify-center gap-3 p-5"
    >
      <p className="max-w-sm text-center text-[13.5px] text-muted-foreground">
        {message.replace(/\.$/, "")}. In-app preview isn't available right now.
      </p>
      <span className="flex items-center gap-2">
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-8 items-center rounded-lg bg-surface-4 px-3 text-[13px] font-medium hover:bg-hover max-md:h-10"
          >
            Try again
          </button>
        ) : null}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-medium text-foreground-soft hover:bg-hover hover:text-foreground max-md:h-10"
        >
          Open file
        </a>
      </span>
    </div>
  );
}
