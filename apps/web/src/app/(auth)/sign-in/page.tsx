"use client";

import Link from "next/link";
import { useState } from "react";
import { createAvenireAuthClient } from "@avenire/auth/client";
import { Button } from "@avenire/ui/components/button";
import { Input } from "@avenire/ui/components/input";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const auth = createAvenireAuthClient(typeof window === "undefined" ? "" : window.location.origin);

  async function submit() {
    setPending(true);
    setError(undefined);
    try {
      const result = await auth.signIn.email({ email: email.trim(), password });
      if (result.error) setError(result.error.message ?? "Could not sign in.");
      else window.location.assign("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
    } finally {
      setPending(false);
    }
  }

  async function google() {
    setError(undefined);
    const result = await auth.signIn.social({ provider: "google", callbackURL: "/" });
    if (result.error) setError(result.error.message ?? "Could not continue with Google.");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-5 px-6">
      <h1 className="text-2xl font-semibold">Sign in to Avenire</h1>
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="grid gap-1.5 text-sm">
          Email
          <Input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          Password
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <Button variant="outline" onClick={() => void google()}>
        Continue with Google
      </Button>
      <p className="text-sm text-muted-foreground">
        New to Avenire?{" "}
        <Link className="text-foreground underline" href="/sign-up">
          Create an account
        </Link>
      </p>
    </main>
  );
}
