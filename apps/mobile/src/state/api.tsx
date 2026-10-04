import { createContext, useContext, useMemo, type PropsWithChildren } from "react";
import { makeClientRuntime, type ClientRuntime } from "@avenire/client-runtime/rpc";
import { apiUrl, getCookieHeader } from "./auth";

const ApiContext = createContext<ClientRuntime | null>(null);

export function ApiProvider({ children }: PropsWithChildren) {
  const runtime = useMemo(
    () =>
      makeClientRuntime({
        baseUrl: apiUrl,
        getAuthHeaders: getCookieHeader,
      }),
    [],
  );

  return <ApiContext.Provider value={runtime}>{children}</ApiContext.Provider>;
}

export function useApi(): ClientRuntime {
  const runtime = useContext(ApiContext);
  if (!runtime) throw new Error("ApiProvider is missing");
  return runtime;
}
