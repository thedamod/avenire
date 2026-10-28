import { useEffect, useState } from "react";
import { apiUrl, getCookieHeader } from "../state/auth";
import { assetRequest } from "./assetRequest";

export function useAssetSource(url: string, attempt = 0) {
  const [state, setState] = useState<{
    url: string;
    attempt: number;
    source?: Awaited<ReturnType<typeof assetRequest>>;
    error?: string;
  }>();
  useEffect(() => {
    let active = true;
    void assetRequest(url, apiUrl, getCookieHeader).then(
      (source) => {
        if (active) setState({ url, attempt, source });
      },
      () => {
        if (active) setState({ url, attempt, error: "This media couldn't be opened." });
      },
    );
    return () => {
      active = false;
    };
  }, [url, attempt]);
  return state?.url === url && state.attempt === attempt ? state : undefined;
}
