"use client";

import { applyPolicy } from "@avenire/capture/policy";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { call, invalidateLibrary } from "@avenire/client-runtime/rpc";
import { useApi, errorMessage, watchQuery } from "~/lib/rpc";
import { CaptureToast } from "./CaptureToast";
import {
  applyProgress,
  getLiveCapture,
  settleCapture,
  startCapture,
  updateLiveCapture,
} from "./liveCapture";
import { setCaptureReceipt } from "./receipt";

const toastId = (captureId: string) => `capture:${captureId}`;

export function useDesktopCapture() {
  const api = useApi();
  const pathname = usePathname();

  useEffect(() => {
    const bridge = window.avenire;
    if (!bridge) return;
    // Auth/prompt pages must not advertise a capture consumer. Main resets this on full navigation.
    const authRoute =
      /^\/(?:sign-in|sign-up|login|register|verify-email|forgot-password|reset-password|prompt|desktop)(?:\/|$)/.test(
        pathname,
      );
    if (authRoute) {
      void bridge.setCaptureReady?.(false);
      return;
    }

    // Swiped away while it was still filling in: the final receipt doesn't bring it back.
    const dismissed = new Set<string>();
    // Closed by us (a failed submit), so a retry that succeeds still shows its receipt.
    const closing = new Set<string>();
    const show = (captureId: string, settled: boolean) => {
      if (dismissed.has(captureId)) return;
      const id = toastId(captureId);
      toast.custom(
        () => (
          <CaptureToast
            captureId={captureId}
            onOpen={() => toast.dismiss(id)}
            onUndo={() => {
              toast.dismiss(id);
              const files = getLiveCapture(captureId)?.receipt?.files ?? [];
              void call(api, (client) =>
                client["library.trashFiles"]({ fileIds: files.map((file) => file.id) }),
              )
                .then(() => invalidateLibrary(api))
                .catch((cause: unknown) => toast.error(`Couldn't undo: ${errorMessage(cause)}`));
            }}
          />
        ),
        {
          id,
          duration: settled ? 8000 : Infinity,
          unstyled: true,
          className: "source-upload-toast",
          onDismiss: () => {
            if (!closing.delete(captureId) && !getLiveCapture(captureId)?.receipt)
              dismissed.add(captureId);
          },
        },
      );
    };

    const unsubscribeStarted = bridge.onCaptureStarted?.((started) => {
      const before = getLiveCapture(started.id);
      updateLiveCapture(started.id, (previous) => startCapture(previous, started));
      // A replay (reload, re-ready) of a press already on screen keeps its toast as it is.
      if (!before) show(started.id, false);
    });
    const unsubscribeProgress = bridge.onCaptureProgress?.((event) => {
      updateLiveCapture(event.id, (previous) => applyProgress(previous, event));
    });

    const inFlight = new Set<string>();
    const unsubscribe = bridge.onCapture((incoming) => {
      const captureId = incoming.snapshot.id;
      if (inFlight.has(captureId)) return;
      // Already submitted (main re-sends until the ack lands): acknowledge, never submit twice.
      if (getLiveCapture(captureId)?.receipt) {
        void bridge.acknowledgeCapture?.(captureId);
        return;
      }
      inFlight.add(captureId);
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
            files: [...(incoming.uploads?.files ?? []), ...result.files],
            skipped: [...(incoming.uploads?.skipped ?? []), ...result.skipped],
            blocked: payload.blocked,
          };
          setCaptureReceipt(receipt);
          updateLiveCapture(captureId, (previous) => settleCapture(previous, captureId, receipt));
          void bridge.acknowledgeCapture?.(captureId);
          show(captureId, true);
        })
        .catch((cause: unknown) => {
          // The error toast takes over; pressing the shortcut again re-sends this capture.
          if (getLiveCapture(captureId)) {
            closing.add(captureId);
            toast.dismiss(toastId(captureId));
          }
          toast.error(
            `Capture failed: ${errorMessage(cause)}. Press the capture shortcut to retry.`,
          );
        })
        .finally(() => inFlight.delete(captureId));
    });

    const controller = new AbortController();
    let stopSettings: (() => void) | undefined;
    void fetch("/api/auth/get-session", { credentials: "include", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then(async (session) => {
        if (controller.signal.aborted) return;
        const userId: string | undefined = session?.user?.id;
        if (userId && !pathname.startsWith("/onboarding")) {
          const preferences = await bridge.getOnboardingPreferences?.();
          // Before first login completes, /onboarding saves these answers itself as part of
          // completing it. Leave them unacknowledged for it, even while an app page briefly
          // renders before the onboarding redirect.
          const onboarded =
            preferences &&
            !controller.signal.aborted &&
            (await call(api, (client) => client["settings.get"]())).onboardingCompletedAt !== null;
          if (preferences && onboarded && !controller.signal.aborted) {
            await call(api, (client) => client["settings.update"](preferences));
            await bridge.acknowledgeOnboardingPreferences?.();
          }
        }
        if (controller.signal.aborted) return;
        if (!userId) return bridge.setCaptureReady?.(false);
        // Reading in the browser follows the setting. Settings writes the same cached query, so a
        // toggle there reaches the desktop without a reload. Until it loads, capture stays off it.
        let readInBrowser: boolean | undefined;
        const ready = (next: boolean) => {
          if (controller.signal.aborted || next === readInBrowser) return;
          readInBrowser = next;
          void bridge.setCaptureReady?.(true, userId, { readInBrowser: next }).catch(() => {});
        };
        stopSettings = watchQuery(
          api,
          (client) => client["settings.get"](),
          "settings",
          (snapshot) => ready(snapshot.settings.captureLoggedInPages),
          () => {
            if (readInBrowser === undefined) ready(false);
          },
        );
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          toast.error(
            `Desktop setup could not sync: ${errorMessage(cause)}. Reload Avenire to retry.`,
          );
      });
    return () => {
      controller.abort();
      stopSettings?.();
      unsubscribe();
      unsubscribeStarted?.();
      unsubscribeProgress?.();
      void bridge.setCaptureReady?.(false);
    };
  }, [api, pathname]);
}
