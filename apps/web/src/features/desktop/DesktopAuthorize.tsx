"use client";

import { useState } from "react";
import { Button } from "@avenire/ui/components/button";
import type { DesktopAuthTarget } from "@avenire/contracts";
import { authorizeDesktop } from "./authorize";

export function DesktopAuthorize({ target, email }: { target: DesktopAuthTarget; email: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const continueInDesktop = async () => {
    setPending(true);
    setError("");
    try {
      const { token } = await authorizeDesktop(target);
      const callback = new URL(`http://127.0.0.1:${target.port}/callback`);
      callback.searchParams.set("state", target.state);
      callback.searchParams.set("token", token);
      window.location.replace(callback.href);
    } catch {
      setError("Could not finish sign-in. Reopen sign-in from the desktop app and try again.");
      setPending(false);
    }
  };
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-medium tracking-tight">Continue in Avenire</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Sign in to the desktop app on this computer as{" "}
          <span className="text-foreground">{email}</span>.
        </p>
        <Button onClick={() => void continueInDesktop()} disabled={pending}>
          {pending ? "Opening Avenire…" : "Continue in desktop"}
        </Button>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <p className="text-xs leading-relaxed text-muted-foreground">
          Only continue if you started sign-in from the Avenire desktop app.
        </p>
      </div>
    </main>
  );
}
