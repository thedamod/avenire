"use client";

import { applyPolicy } from "@avenire/desktop/capture-policy";
import { useEffect } from "react";
import { toast } from "sonner";
import { call, invalidateLibrary } from "@avenire/client-runtime/rpc";
import { useApi, errorMessage } from "~/lib/rpc";
import { setCaptureReceipt } from "./receipt";

export function useDesktopCapture() {
  const api = useApi();

  useEffect(() => {
    const bridge = window.avenire;
    if (!bridge) return;

    return bridge.onCapture((incoming) => {
      // Enforce the same outbound allowlist even with an older desktop bridge.
      const filtered = applyPolicy(incoming.snapshot);
      const payload = {
        snapshot: filtered.snapshot,
        blocked: [...incoming.blocked, ...filtered.blocked],
      };
      void call(api, (client) => client["library.submitCapture"]({ snapshot: payload.snapshot }))
        .then((result) => {
          invalidateLibrary(api);
          const receipt = {
            capturedAt: payload.snapshot.capturedAt,
            files: result.files,
            skipped: result.skipped,
            blocked: payload.blocked,
          };
          setCaptureReceipt(receipt);
          toast.custom(
            () => (
              <div className="w-[min(24rem,calc(100vw-2rem))] border border-border bg-popover p-4 text-popover-foreground shadow-md">
                <p className="font-medium">Capture received</p>
                <ul className="mt-2 grid gap-1 text-sm text-muted-foreground">
                  {result.files.map((file) => (
                    <li key={file.id}>Saved: {file.title}</li>
                  ))}
                  {result.skipped.map((file, index) => (
                    <li key={`${file.title}-${index}`}>
                      Skipped {file.title}: {file.reason}
                    </li>
                  ))}
                  {payload.blocked.map((file, index) => (
                    <li key={`${file.title}-${index}`}>
                      Blocked {file.title}: {file.category}
                    </li>
                  ))}
                  {result.files.length + result.skipped.length + payload.blocked.length === 0 ? (
                    <li>No files to add.</li>
                  ) : null}
                </ul>
              </div>
            ),
            { duration: 8000 },
          );
        })
        .catch((cause: unknown) => toast.error(`Capture failed: ${errorMessage(cause)}`));
    });
  }, [api]);
}
