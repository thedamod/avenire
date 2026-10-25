"use client";

import { applyPolicy } from "@avenire/desktop/capture-policy";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { call, invalidateLibrary } from "@avenire/client-runtime/rpc";
import { useApi, errorMessage } from "~/lib/rpc";
import { CaptureToast } from "./CaptureToast";
import { setCaptureReceipt } from "./receipt";

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

    const inFlight = new Set<string>();
    const unsubscribe = bridge.onCapture((incoming) => {
      if (inFlight.has(incoming.snapshot.id)) return;
      inFlight.add(incoming.snapshot.id);
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
          void bridge.acknowledgeCapture?.(payload.snapshot.id);
          toast.custom(
            (id) => (
              <CaptureToast
                receipt={receipt}
                onOpen={() => toast.dismiss(id)}
                onUndo={() => {
                  toast.dismiss(id);
                  void call(api, (client) =>
                    client["library.trashFiles"]({ fileIds: receipt.files.map((file) => file.id) }),
                  )
                    .then(() => invalidateLibrary(api))
                    .catch((cause: unknown) =>
                      toast.error(`Couldn't undo: ${errorMessage(cause)}`),
                    );
                }}
              />
            ),
            { duration: 8000, unstyled: true },
          );
        })
        .catch((cause: unknown) =>
          toast.error(
            `Capture failed: ${errorMessage(cause)}. Press the capture shortcut to retry.`,
          ),
        )
        .finally(() => inFlight.delete(incoming.snapshot.id));
    });
    const controller = new AbortController();
    void fetch("/api/auth/get-session", { credentials: "include", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then(async (session) => {
        if (controller.signal.aborted) return;
        if (session?.user?.id && !pathname.startsWith("/onboarding")) {
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
        if (!controller.signal.aborted)
          return bridge.setCaptureReady?.(Boolean(session?.user?.id), session?.user?.id);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          toast.error(
            `Desktop setup could not sync: ${errorMessage(cause)}. Reload Avenire to retry.`,
          );
      });
    return () => {
      controller.abort();
      unsubscribe();
      void bridge.setCaptureReady?.(false);
    };
  }, [api, pathname]);
}
