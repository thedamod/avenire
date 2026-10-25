"use client";

import { KeyboardLayer } from "~/components/app";
import { EphemeralPromptHost } from "~/features/ephemeral";
import { LibraryProvider } from "~/features/library/LibraryProvider";
import { SourceUploadProvider } from "~/features/library/SourceUploadProvider";
import { SettingsProvider } from "~/features/settings/SettingsProvider";
import { useTrackNavigation } from "~/lib/navigation";

/** Full-bleed dark page. No sidebar or navbar: each page brings its own header when it needs one. */
export default function AppLayoutClient({ children }: Readonly<{ children: React.ReactNode }>) {
  useTrackNavigation();
  return (
    <SettingsProvider>
      <LibraryProvider>
        <SourceUploadProvider>
          <div className="min-h-dvh bg-background text-foreground">
            {children}
            <KeyboardLayer />
            <EphemeralPromptHost />
          </div>
        </SourceUploadProvider>
      </LibraryProvider>
    </SettingsProvider>
  );
}
