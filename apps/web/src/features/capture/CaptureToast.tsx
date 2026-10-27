"use client";

import Link from "next/link";
import { useCallback, useSyncExternalStore } from "react";
import { fileHref } from "~/features/library/FileRow";
import { CapturePanel, type RenderCaptureLink } from "./CapturePanel";
import { CaptureShortcutKeys } from "./CaptureShortcutKeys";
import { getLiveCapture, subscribeLiveCaptures } from "./liveCapture";

/** The in-app capture toast: the shared panel over the live capture store, with Next links. */
export function CaptureToast({
  captureId,
  onUndo,
  onOpen,
}: {
  captureId: string;
  onUndo: () => void;
  onOpen: () => void;
}) {
  const live = useSyncExternalStore(
    subscribeLiveCaptures,
    () => getLiveCapture(captureId),
    () => undefined,
  );
  const renderLink = useCallback<RenderCaptureLink>(
    (target, { className, children }) => (
      <Link
        href={target.type === "file" ? fileHref(target.file) : "/?tab=sources&filter=unfiled"}
        onClick={onOpen}
        className={className}
      >
        {children}
      </Link>
    ),
    [onOpen],
  );
  return (
    <CapturePanel
      rows={live?.rows ?? []}
      phase={live?.receipt ? "done" : "capturing"}
      keys={<CaptureShortcutKeys />}
      onUndo={live?.receipt?.files.length ? onUndo : undefined}
      renderLink={renderLink}
      className="w-[min(358px,calc(100vw-2rem))]"
    />
  );
}
