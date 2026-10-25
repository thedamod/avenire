import { createContext, useContext, useEffect, useMemo, type PropsWithChildren } from "react";
import {
  disposeClientRuntime,
  makeClientRuntime,
  type ClientRuntime,
} from "@avenire/client-runtime/rpc";
import { apiUrl, authClient, getCookieHeader } from "./auth";

const ApiContext = createContext<ClientRuntime | null>(null);

export function ApiProvider({ children }: PropsWithChildren) {
  const { data: session } = authClient.useSession();
  const owner = session?.user.id;
  const runtime = useMemo(
    () =>
      makeClientRuntime({
        baseUrl: apiUrl,
        getAuthHeaders: getCookieHeader,
        // The session cookie is attached by hand; "include" lets the native cookie jar clobber it.
        credentials: "omit",
      }),
    [owner],
  );

  useEffect(
    () => () => {
      void disposeClientRuntime(runtime);
    },
    [runtime],
  );

  return (
    <ApiContext.Provider key={owner ?? "signed-out"} value={runtime}>
      {children}
    </ApiContext.Provider>
  );
}

export function useApi(): ClientRuntime {
  const runtime = useContext(ApiContext);
  if (!runtime) throw new Error("ApiProvider is missing");
  return runtime;
}
