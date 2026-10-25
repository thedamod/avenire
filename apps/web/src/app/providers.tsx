"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@avenire/ui/components/tooltip";
import { makeClientRuntime, type ClientRuntime } from "@avenire/client-runtime/rpc";
import { initBrowserAnalytics } from "@avenire/shared/observability-browser";
import { ApiContext } from "~/lib/rpc";
import { useDesktopCapture } from "~/features/capture/useDesktopCapture";
import { DesktopFrame } from "~/features/desktop/DesktopFrame";
import { useWebHaptics } from "~/lib/useWebHaptics";

/** One Toaster for the app. Sonner's own motion (400ms `ease`, swipe, stacking) is kept as is. */
function AppToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="bottom-right"
      theme={resolvedTheme === "light" ? "light" : "dark"}
      offset={{ bottom: "calc(16px + env(safe-area-inset-bottom))" }}
      mobileOffset={{ bottom: "calc(84px + env(safe-area-inset-bottom))" }}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-[10px] !border-border !bg-popover !text-foreground !text-[13px] !shadow-none",
          description: "!text-foreground-soft",
          actionButton: "!h-7 !rounded-[7px] !bg-primary !text-primary-foreground",
        },
      }}
    />
  );
}

function DesktopCaptureListener() {
  useDesktopCapture();
  return null;
}

function ApplicationProviders({ children }: Readonly<{ children: React.ReactNode }>) {
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
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <TooltipProvider delayDuration={400}>
        <DesktopFrame>
          <ApiContext.Provider value={runtime}>
            {runtime ? (
              children
            ) : (
              <main className="min-h-screen bg-background" aria-label="Loading" />
            )}
            {runtime ? <DesktopCaptureListener /> : null}
            <AppToaster />
          </ApiContext.Provider>
        </DesktopFrame>
      </TooltipProvider>
    </ThemeProvider>
  );
}

export function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  useWebHaptics();
  const pathname = usePathname();
  // A native document host has no app RPC, capture listeners or analytics. In particular,
  // analytics must never collect the signed byte capability carried in its URL fragment.
  if (pathname?.startsWith("/source-preview/"))
    return (
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <TooltipProvider delayDuration={400}>{children}</TooltipProvider>
      </ThemeProvider>
    );
  return <ApplicationProviders>{children}</ApplicationProviders>;
}
