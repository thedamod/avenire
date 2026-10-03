"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { call } from "@avenire/client-runtime/rpc";
import { useApi, errorMessage } from "~/lib/rpc";
import { setCaptureReceipt } from "./receipt";

export function useDesktopCapture() {
  const api = useApi();

  useEffect(() => {
    const bridge = window.avenire;
    if (!bridge) return;

    return bridge.onCapture((payload) => {
      void call(api, (client) => client["library.submitCapture"]({ snapshot: payload.snapshot }))
        .then((result) => {
          const receipt = {
            capturedAt: payload.snapshot.capturedAt,
            items: result.items,
            skipped: result.skipped,
            blocked: payload.blocked,
          };
          setCaptureReceipt(receipt);
          toast.custom(
            () => (
              <div className="w-[min(24rem,calc(100vw-2rem))] border border-border bg-popover p-4 text-popover-foreground shadow-md">
                <p className="font-medium">Capture received</p>
                <ul className="mt-2 grid gap-1 text-sm text-muted-foreground">
                  {result.items.map((item) => (
                    <li key={item.id}>Saved: {item.title}</li>
                  ))}
                  {result.skipped.map((item, index) => (
                    <li key={`${item.title}-${index}`}>
                      Skipped {item.title}: {item.reason}
                    </li>
                  ))}
                  {payload.blocked.map((item, index) => (
                    <li key={`${item.title}-${index}`}>
                      Blocked {item.title}: {item.category}
                    </li>
                  ))}
                  {result.items.length + result.skipped.length + payload.blocked.length === 0 ? (
                    <li>No items to add.</li>
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
