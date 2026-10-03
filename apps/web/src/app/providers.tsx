"use client";

import { useEffect, useState } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { makeClientRuntime, type ClientRuntime } from "@avenire/client-runtime/rpc";
import { initBrowserAnalytics } from "@avenire/shared/observability-browser";
import { ApiContext } from "~/lib/rpc";
import { useDesktopCapture } from "~/features/capture/useDesktopCapture";

function DesktopCaptureListener() {
  useDesktopCapture();
  return null;
}

export function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  const [runtime, setRuntime] = useState<ClientRuntime>();

  useEffect(() => {
    const api = makeClientRuntime({ baseUrl: window.location.origin });
    setRuntime(api);
    initBrowserAnalytics({
      key: process.env.NEXT_PUBLIC_POSTHOG_KEY,
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      surface: window.avenire ? "desktop" : "web",
    });
    return () => void api.dispose();
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ApiContext.Provider value={runtime}>
        {runtime ? children : <main className="min-h-screen bg-background" aria-label="Loading" />}
        {runtime ? <DesktopCaptureListener /> : null}
        <Toaster position="bottom-right" />
      </ApiContext.Provider>
    </ThemeProvider>
  );
}
