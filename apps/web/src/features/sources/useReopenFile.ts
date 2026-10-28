"use client";

import { useCallback, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { call } from "@avenire/client-runtime/rpc";
import { useApi } from "~/lib/rpc";
import { reopenFile, type ReopenFile } from "./reopen";

const subscribe = () => () => {};
/** True inside the desktop shell; false on the server and in a browser. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !!window.avenire,
    () => false,
  );
}

/** "Open original" for any surface: `reopen(file)` or `reopen(file, signedUrl)`. */
export function useReopenFile() {
  const api = useApi();
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(
    (file: ReopenFile, stored?: string) =>
      void reopenFile(file, {
        bridge: window.avenire,
        open: (url) => window.open(url, "_blank", "noopener"),
        navigate: (href) => router.push(href),
        notify: (message) => toast(message),
        opened: (fileId) =>
          void call(api, (client) =>
            client["library.recordFileEvent"]({ fileId, kind: "opened" }),
          ).catch(() => {}),
        stored,
        pathname,
      }),
    [api, router, pathname],
  );
}
