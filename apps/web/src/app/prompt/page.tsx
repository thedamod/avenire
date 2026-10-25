"use client";

import type { FolderId } from "@avenire/contracts";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { EphemeralPrompt } from "~/features/ephemeral/EphemeralPrompt";
import { isEphemeralShortcut } from "~/features/ephemeral/EphemeralPromptHost";

function Prompt() {
  const params = useSearchParams();
  const [session, setSession] = useState(1);
  const question = params.get("q");
  const folder = params.get("folder");

  // The frameless window draws only the text: no page background or grain.
  useEffect(() => {
    const html = document.documentElement;
    const previous = [
      html.style.background,
      document.body.style.background,
      document.body.style.backgroundImage,
    ];
    html.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.backgroundImage = "none";
    return () => {
      [html.style.background, document.body.style.background, document.body.style.backgroundImage] =
        previous as [string, string, string];
    };
  }, []);

  // ⌥ Space inside the window starts a fresh question.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isEphemeralShortcut(event)) return;
      event.preventDefault();
      setSession((value) => value + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main className="flex min-h-dvh items-end justify-end bg-transparent p-6">
      <div className="w-full max-w-[22rem]">
        <EphemeralPrompt
          key={session}
          session={session}
          initialQuestion={session === 1 ? question : null}
          folderId={(folder as FolderId | null) ?? null}
          standalone
          onDismiss={() => {
            // The desktop shell hides the window on blur/esc; a browser tab just resets.
            if (window.opener || window.avenire)
              void (window.avenire?.hidePrompt?.() ?? window.close());
            else setSession((value) => value + 1);
          }}
        />
      </div>
    </main>
  );
}

/** Standalone ⌥ Space prompt for the desktop app's frameless always-on-top window. */
export default function PromptPage() {
  return (
    <Suspense>
      <Prompt />
    </Suspense>
  );
}
