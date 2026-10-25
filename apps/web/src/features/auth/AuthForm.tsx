"use client";

import { createAvenireAuthClient } from "@avenire/auth/client";
import { Button } from "@avenire/ui/components/button";
import { Input } from "@avenire/ui/components/input";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { StateSwap } from "./StateSwap";
import { MIN_PASSWORD_LENGTH, safeCallbackURL, type AuthMode } from "./auth-utils";

const titles: Record<AuthMode, string> = {
  "sign-in": "Sign in",
  "sign-up": "Create your account",
  "verify-email": "Check your email",
  "forgot-password": "Reset your password",
  "reset-password": "Choose a new password",
};

function PasswordField({
  label,
  value,
  onChange,
  current = false,
  hint = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  current?: boolean;
  hint?: boolean;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-password">
        <Input
          id={id}
          name={label === "Confirm password" ? "confirmPassword" : "password"}
          type={visible ? "text" : "password"}
          autoComplete={current ? "current-password" : "new-password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          minLength={current ? undefined : MIN_PASSWORD_LENGTH}
          maxLength={128}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        <button
          type="button"
          className="auth-reveal"
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="auth-hint">
          {value.length === 0
            ? "At least 8 characters."
            : value.length < 8
              ? `${8 - value.length} more characters needed.`
              : value.length < 12
                ? "Longer passwords are stronger."
                : "Good length. Use a unique password."}
        </p>
      )}
    </div>
  );
}

function Feedback({ message, children }: { message: string; children?: React.ReactNode }) {
  return (
    <div
      className="auth-feedback"
      data-visible={Boolean(message)}
      aria-live="polite"
      aria-atomic="true"
    >
      <div>
        <p>{message}</p>
        {children}
      </div>
    </div>
  );
}

export function AuthForm({ mode, googleEnabled }: { mode: AuthMode; googleEnabled: boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  const [auth] = useState(() =>
    createAvenireAuthClient(typeof window === "undefined" ? "" : window.location.origin),
  );
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(
    mode === "verify-email" && params.has("error")
      ? "This verification link has expired or is invalid. Request a new one."
      : (params.get("error_description") ?? params.get("error") ?? ""),
  );
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [sent, setSent] = useState(false);
  const [success, setSuccess] = useState(false);
  const [resetExpired, setResetExpired] = useState(false);
  const cooldownUntil = useRef(0);
  const [unverified, setUnverified] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const callback = safeCallbackURL(params.get("callbackURL"));
  const token = params.get("token");
  const verificationCallback = `/verify-email?${new URLSearchParams({ verified: "1", email: email.trim(), callbackURL: callback })}`;
  const authLink = (path: string) =>
    `${path}?${new URLSearchParams({ ...(email ? { email: email.trim() } : {}), callbackURL: callback })}`;
  const sentDestination = authLink("/verify-email");
  useEffect(() => {
    if (mode !== "sign-up" || !sent) return;
    const timer = setTimeout(() => router.replace(sentDestination), 200);
    return () => clearTimeout(timer);
  }, [mode, sent, router, sentDestination]);
  const cooldownKey = `avenire-auth-resend:${mode === "forgot-password" ? "reset" : "verify"}:${email.trim().toLowerCase()}`;

  useEffect(() => {
    cooldownUntil.current = 0;
    const tick = () => {
      let until = cooldownUntil.current;
      try {
        until = Number(sessionStorage.getItem(cooldownKey)) || until;
      } catch {
        /* Storage is optional. */
      }
      setCooldown(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [cooldownKey]);
  useEffect(() => {
    if (mode !== "verify-email") return;
    let active = true;
    void auth
      .getSession()
      .then((result) => {
        if (active && result.data?.user.emailVerified) {
          if (params.get("verified") === "1" && !params.get("error")) {
            setEmail(result.data.user.email);
            setSuccess(true);
          } else window.location.replace("/");
        }
      })
      .catch(() => {
        if (active) setError("Could not check verification. Try again.");
      });
    return () => {
      active = false;
    };
  }, [auth, mode, params]);

  /* eslint-disable react/purity -- Event handler persists a wall-clock cooldown. */
  function startCooldown() {
    setCooldown(60);
    cooldownUntil.current = Date.now() + 60_000;
    try {
      sessionStorage.setItem(cooldownKey, String(cooldownUntil.current));
    } catch {
      /* Storage is optional. */
    }
  }
  /* eslint-enable react/purity */
  async function run(action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      await action();
    } catch {
      setError("Could not connect. Please try again.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  function failure(result: {
    error?: { message?: string | undefined; code?: string | undefined } | null | undefined;
  }) {
    if (!result.error) return false;
    setError(result.error.message ?? "Please try again.");
    setUnverified(result.error.code === "EMAIL_NOT_VERIFIED");
    if (mode === "reset-password" && /TOKEN|EXPIRED/.test(result.error.code ?? ""))
      setResetExpired(true);
    return true;
  }
  async function resend() {
    if (cooldown > 0) return;
    await run(async () => {
      const result =
        mode === "forgot-password"
          ? await auth.requestPasswordReset({
              email: email.trim(),
              redirectTo: authLink("/reset-password"),
            })
          : await auth.sendVerificationEmail({
              email: email.trim(),
              callbackURL: verificationCallback,
            });
      if (!failure(result)) {
        startCooldown();
        setSent(true);
        if (mode === "sign-in") router.push(authLink("/verify-email"));
      }
    });
  }
  async function submit() {
    if (mode === "reset-password" && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    await run(async () => {
      if (mode === "sign-in") {
        const result = await auth.signIn.email({
          email: email.trim(),
          password,
          callbackURL: callback,
        });
        if (!failure(result)) window.location.assign(callback);
      } else if (mode === "sign-up") {
        const result = await auth.signUp.email({
          name: name.trim(),
          email: email.trim(),
          password,
          callbackURL: verificationCallback,
        });
        if (!failure(result)) {
          startCooldown();
          setSent(true);
        }
      } else if (mode === "forgot-password") {
        const result = await auth.requestPasswordReset({
          email: email.trim(),
          redirectTo: authLink("/reset-password"),
        });
        if (!failure(result)) {
          startCooldown();
          setSent(true);
        }
      } else if (mode === "reset-password") {
        const result = await auth.resetPassword({ newPassword: password, token: token ?? "" });
        if (!failure(result)) {
          setPassword("");
          setConfirm("");
          setSuccess(true);
        }
      } else {
        const result = await auth.sendVerificationEmail({
          email: email.trim(),
          callbackURL: verificationCallback,
        });
        if (!failure(result)) {
          startCooldown();
          setSent(true);
        }
      }
    });
  }
  const emailId = useId();
  const nameId = useId();
  const showSent = (mode === "verify-email" && Boolean(email)) || sent;
  const invalidReset =
    mode === "reset-password" && (!token || Boolean(params.get("error")) || resetExpired);
  const showForm = !success && !showSent && !invalidReset;
  const title = success
    ? mode === "verify-email"
      ? "Email verified"
      : "Password updated"
    : invalidReset
      ? "This link has expired"
      : showSent
        ? "Check your email"
        : titles[mode];

  return (
    <section className="auth-content" aria-labelledby="auth-title">
      <StateSwap stateKey={`${mode}-${success}-${showSent}-${invalidReset}`}>
        <h1 id="auth-title" tabIndex={-1}>
          {title}
        </h1>
        {success ? (
          <>
            <p className="auth-copy">
              {mode === "verify-email" ? "Your email is verified." : "Your new password is ready."}
            </p>
            <Link
              className="auth-primary-link"
              href={mode === "verify-email" ? callback : authLink("/sign-in")}
            >
              {mode === "verify-email" ? "Continue" : "Sign in"}
            </Link>
          </>
        ) : invalidReset ? (
          <>
            <p className="auth-copy">Request a new password reset link.</p>
            <Link className="auth-primary-link" href={authLink("/forgot-password")}>
              Reset password
            </Link>
          </>
        ) : (
          <>
            {showSent && (
              <>
                <p className="auth-copy">
                  {mode === "forgot-password"
                    ? "If an account exists, a reset link is on its way to"
                    : "A verification link is on its way to"}{" "}
                  <span className="auth-address">{email}</span>.
                </p>
                <Button
                  className="auth-submit"
                  disabled={pending || cooldown > 0}
                  onClick={() => void resend()}
                >
                  {pending && <LoaderCircle className="auth-spinner" size={15} />}
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend email"}
                </Button>
                <Link
                  className="auth-secondary-link"
                  href={`${mode === "forgot-password" ? "/forgot-password" : "/sign-up"}?${new URLSearchParams({ callbackURL: callback })}`}
                  onClick={() => {
                    setSent(false);
                    setEmail("");
                    setError("");
                  }}
                >
                  Use a different email
                </Link>
              </>
            )}
            {showForm && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
                aria-busy={pending}
              >
                {mode === "sign-up" && (
                  <div className="auth-field">
                    <label htmlFor={nameId}>Name</label>
                    <Input
                      id={nameId}
                      name="name"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      maxLength={100}
                      pattern=".*\S.*"
                    />
                  </div>
                )}
                {mode !== "reset-password" && (
                  <div className="auth-field">
                    <label htmlFor={emailId}>Email</label>
                    <Input
                      id={emailId}
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                )}
                {(mode === "sign-in" || mode === "sign-up" || mode === "reset-password") && (
                  <PasswordField
                    label={mode === "reset-password" ? "New password" : "Password"}
                    value={password}
                    onChange={setPassword}
                    current={mode === "sign-in"}
                    hint={mode !== "sign-in"}
                  />
                )}
                {mode === "reset-password" && (
                  <PasswordField label="Confirm password" value={confirm} onChange={setConfirm} />
                )}
                {mode === "sign-in" && (
                  <Link className="auth-forgot" href={authLink("/forgot-password")}>
                    Forgot password?
                  </Link>
                )}
                <Feedback message={error}>
                  {unverified && (
                    <button
                      className="auth-text-button"
                      type="button"
                      disabled={pending || cooldown > 0}
                      onClick={() => void resend()}
                    >
                      {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend verification email"}
                    </button>
                  )}
                </Feedback>
                <Button type="submit" className="auth-submit" disabled={pending}>
                  {pending && <LoaderCircle className="auth-spinner" size={15} />}
                  {mode === "sign-in"
                    ? "Sign in"
                    : mode === "sign-up"
                      ? "Create account"
                      : mode === "reset-password"
                        ? "Update password"
                        : "Send email"}
                </Button>
              </form>
            )}
            {!showForm && <Feedback message={error} />}
            {(mode === "sign-in" || mode === "sign-up") && !showSent && (
              <>
                {googleEnabled && (
                  <>
                    <div className="auth-divider">
                      <span>or</span>
                    </div>
                    <Button
                      variant="outline"
                      className="auth-google"
                      disabled={pending}
                      onClick={() =>
                        void run(async () => {
                          failure(
                            await auth.signIn.social({
                              provider: "google",
                              callbackURL: callback,
                              errorCallbackURL: authLink(`/${mode}`),
                            }),
                          );
                        })
                      }
                    >
                      Continue with Google
                    </Button>
                  </>
                )}
                <p className="auth-switch">
                  {mode === "sign-in" ? "New to Avenire?" : "Already have an account?"}{" "}
                  <Link href={authLink(mode === "sign-in" ? "/sign-up" : "/sign-in")}>
                    {mode === "sign-in" ? "Create an account" : "Sign in"}
                  </Link>
                </p>
                <p className="auth-terms">
                  By continuing, you agree to our{" "}
                  <a href="https://avenire.space/terms">Terms of Service</a> and{" "}
                  <a href="https://avenire.space/privacy">Privacy Policy</a>.
                </p>
              </>
            )}
            {(mode === "forgot-password" || (mode === "verify-email" && !success)) && (
              <Link className="auth-secondary-link" href={authLink("/sign-in")}>
                Back to sign in
              </Link>
            )}
          </>
        )}
      </StateSwap>
    </section>
  );
}
