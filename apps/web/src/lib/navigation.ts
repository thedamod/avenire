"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";

// How many in-app pages this tab has shown; back only uses history when we came from inside the app.
let visited = 0;

/** Mount once in the app layout. */
export function useTrackNavigation() {
  const pathname = usePathname();
  useEffect(() => {
    visited += 1;
  }, [pathname]);
}

/** Goes back in history when the previous page was ours, otherwise to `fallback`. */
export function useBack(fallback = "/") {
  const router = useRouter();
  return useCallback(() => {
    if (visited > 1 && window.history.length > 1) router.back();
    else router.push(fallback);
  }, [router, fallback]);
}
