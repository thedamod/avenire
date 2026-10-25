"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Button } from "@avenire/ui/components/button";
import { Kbd } from "@avenire/ui/components/kbd";
import { ListChecks, Upload } from "lucide-react";
import { CaptureShortcutKeys } from "~/features/capture/CaptureShortcutKeys";
import { SOURCE_UPLOAD_ACCEPT } from "./uploadSource";
import { useSourceUploads } from "./SourceUploadProvider";

const subscribeToDesktop = () => () => {};
const desktopSnapshot = () => !!window.avenire;
const serverDesktopSnapshot = () => undefined;

export function SourceUpload() {
  const input = useRef<HTMLInputElement>(null);
  const uploads = useSourceUploads();
  const desktop = useSyncExternalStore<boolean | undefined>(
    subscribeToDesktop,
    desktopSnapshot,
    serverDesktopSnapshot,
  );
  useEffect(() => {
    if (window.avenire) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        !event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== "u"
      )
        return;
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]',
        )
      )
        return;
      if (
        document.querySelector(
          '[role="dialog"], [role="alertdialog"], [role="menu"], [data-slot="popover-content"][data-state="open"]',
        )
      )
        return;
      event.preventDefault();
      input.current?.click();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  return (
    <div className="ml-auto flex shrink-0 items-center gap-2">
      <input
        ref={input}
        type="file"
        multiple
        accept={SOURCE_UPLOAD_ACCEPT}
        aria-label="Choose source files"
        className="hidden"
        onChange={(event) => {
          uploads.add(Array.from(event.currentTarget.files ?? []));
          event.currentTarget.value = "";
        }}
      />
      <span className="hidden items-center gap-1.5 text-[12.5px] text-muted-foreground md:flex">
        {desktop === undefined ? null : desktop ? (
          <CaptureShortcutKeys hint />
        ) : (
          <>
            Press <Kbd className="h-5 min-w-5 text-[11px]">Ctrl</Kbd>
            <Kbd className="h-5 min-w-5 text-[11px]">U</Kbd> to upload or drag and drop
          </>
        )}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Upload files"
        aria-keyshortcuts={desktop === false ? "Control+U" : undefined}
        title={desktop === false ? "Upload files (Ctrl+U)" : "Upload files"}
        onClick={() => input.current?.click()}
        className="size-11 md:size-7"
      >
        <Upload aria-hidden="true" />
      </Button>
      {uploads.count ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Upload status (${uploads.count})`}
          title="Upload status"
          onClick={uploads.show}
          className="size-11 md:size-7"
        >
          <ListChecks aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}

/** Keep file drops in the same queue and ingestion flow as the file picker. */
export function SourceUploadArea({ children }: { children: ReactNode }) {
  const { add } = useSourceUploads();
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const reset = useCallback(() => {
    depth.current = 0;
    setDragging(false);
  }, []);
  useEffect(() => {
    window.addEventListener("dragend", reset);
    window.addEventListener("drop", reset);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("dragend", reset);
      window.removeEventListener("drop", reset);
      window.removeEventListener("blur", reset);
    };
  }, [reset]);
  return (
    <section
      aria-label="Sources"
      className="relative flex min-h-40 flex-col gap-3"
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.stopPropagation();
        reset();
        add(Array.from(event.dataTransfer.files));
      }}
    >
      {children}
      {dragging ? (
        <div
          role="status"
          className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-foreground/40 bg-background/95 px-4 py-8 text-sm text-foreground"
        >
          <Upload className="size-5" strokeWidth={1.5} aria-hidden="true" />
          Drop files to upload
        </div>
      ) : null}
    </section>
  );
}
