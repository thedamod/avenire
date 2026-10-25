"use client";

import Link from "next/link";
import type { LibraryFile } from "@avenire/contracts";
import { FileKindIcon } from "~/components/app";
import { formatTimestamp } from "~/lib/time";
import type { CaptureReceipt } from "./receipt";
import { CaptureShortcutKeys } from "./CaptureShortcutKeys";

function detail(file: LibraryFile): string {
  if (file.mediaPositionSec) return `at ${formatTimestamp(file.mediaPositionSec)}`;
  if (file.kind === "web-page") return "whole page";
  return "";
}

/** 13a: what ⌥C just captured, with Undo and a link to Sources › Unfiled. */
export function CaptureToast({
  receipt,
  onUndo,
  onOpen,
}: {
  receipt: CaptureReceipt;
  onUndo: () => void;
  onOpen: () => void;
}) {
  const count = receipt.files.length;
  const dropped = [
    ...receipt.skipped.map((item) => ({ title: item.title, reason: item.reason })),
    ...receipt.blocked.map((item) => ({ title: item.title, reason: `blocked · ${item.category}` })),
  ];
  return (
    <div className="w-[min(358px,calc(100vw-2rem))] overflow-hidden rounded-[10px] border border-sheet-border bg-[#131313] text-foreground">
      <div className="flex items-center gap-2 px-3.5 pt-3 pb-2">
        <CaptureShortcutKeys />
        <span className="text-[13.5px] font-semibold">
          {count ? `Captured ${count} thing${count === 1 ? "" : "s"}` : "Nothing captured"}
        </span>
        {count ? (
          <button
            type="button"
            onClick={onUndo}
            className="ml-auto h-7 rounded-[7px] bg-surface-4 px-2.5 text-[12.5px] font-semibold hover:bg-surface-5"
          >
            Undo
          </button>
        ) : null}
      </div>
      <ul className="flex flex-col px-3.5 pb-2">
        {receipt.files.map((file) => (
          <li key={file.id} className="flex h-[30px] items-center gap-3 text-[13px]">
            <FileKindIcon kind={file.kind} url={file.sourceUrl} />
            <span className="min-w-0 flex-1 truncate">{file.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{detail(file)}</span>
          </li>
        ))}
        {dropped.map((item, index) => (
          <li
            key={`${item.title}-${index}`}
            className="flex h-[30px] items-center gap-3 text-[13px] text-muted-foreground"
          >
            <span className="min-w-0 flex-1 truncate">{item.title}</span>
            <span className="shrink-0 text-xs">{item.reason}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3 border-t border-border px-3.5 py-2.5 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1">In Sources · Unfiled. Ruth can sort them tonight.</span>
        <Link
          href="/?tab=sources&filter=unfiled"
          onClick={onOpen}
          className="font-semibold text-ruth-text hover:underline"
        >
          Open
        </Link>
      </div>
    </div>
  );
}
