import type { DatabaseClient } from "@avenire/database/client";
import { expect, it } from "@effect/vitest";
import { memoryAdapter } from "better-auth/adapters/memory";
import * as Effect from "effect/Effect";
import { createAuth, makeAuthService } from "./server.ts";

it.effect("serves verified signup, sign-in, revocable sessions and sign-out over HTTP", () =>
  Effect.gen(function* () {
    const emails: Array<{ props: { url: string }; template: string }> = [];
    const db = {
      insert: () => ({
        values: async (entry: (typeof emails)[number]) => {
          emails.push(entry);
        },
      }),
    } as unknown as DatabaseClient;
    const auth = createAuth(
      {
        db,
        baseURL: "https://app.test",
        secret: "test-only-auth-secret-at-least-32-characters",
        trustedOrigins: ["https://app.test", "avenire://"],
      },
      memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    );
    const handle = (
      path: string,
      body?: unknown,
      cookie?: string,
      originHeaders: Record<string, string> = { origin: "https://app.test" },
    ) =>
      Effect.promise(() =>
        auth.handler(
          new Request(`https://app.test/api/auth/${path}`, {
            ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
            headers: {
              ...originHeaders,
              "content-type": "application/json",
              ...(cookie === undefined ? {} : { cookie }),
            },
          }),
        ),
      );
    const signedOut = yield* handle("get-session");
    expect(signedOut.status).toBe(200);
    expect(yield* Effect.promise(() => signedOut.json())).toBeNull();

    const credentials = { email: "fixture@example.test", password: "test-password-123" };
    const signup = yield* handle("sign-up/email", { ...credentials, name: "Fixture" });
    expect(signup.status).toBe(200);
    expect(emails).toHaveLength(1);
    expect(emails[0]?.template).toBe("verify-email");
    expect((yield* handle("sign-in/email", credentials)).status).toBe(403);

    const verification = yield* Effect.promise(() =>
      auth.handler(new Request(emails[0]!.props.url)),
    );
    expect(verification.status).toBe(302);
    expect(verification.headers.get("location")).toBe("/");

    const signIn = yield* handle("sign-in/email", credentials);
    expect(signIn.status).toBe(200);
    const cookies = signIn.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    expect(cookies).toContain("__Secure-better-auth.session_token=");
    const headers = new Headers({ cookie: cookies });
    const service = makeAuthService(auth);
    expect(yield* service.getSession(headers)).toMatchObject({ email: credentials.email });
    const session = yield* handle("get-session", undefined, cookies);
    expect(session.status).toBe(200);
    expect(yield* Effect.promise(() => session.json())).toMatchObject({
      user: { email: credentials.email, emailVerified: true },
    });

    expect((yield* handle("sign-out", {}, cookies)).status).toBe(200);
    expect(yield* service.getSession(headers)).toBeNull();
    expect(
      yield* service.getSession(new Headers({ cookie: "better-auth.session_token=forged" })),
    ).toBeNull();

    // Native Expo requests send their app scheme through expo-origin.
    const nativeSignIn = yield* handle("sign-in/email", credentials, undefined, {
      "expo-origin": "avenire://",
    });
    expect(nativeSignIn.status).toBe(200);
    const nativeCookies = nativeSignIn.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    expect(yield* service.getSession(new Headers({ cookie: nativeCookies }))).toMatchObject({
      email: credentials.email,
    });
    for (const headers of [
      { origin: "https://attacker.test" },
      { "expo-origin": "attacker://" },
      { "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate" },
    ]) {
      expect((yield* handle("sign-out", {}, nativeCookies, headers)).status).toBe(403);
    }
    expect(yield* service.getSession(new Headers({ cookie: nativeCookies }))).not.toBeNull();

    const reset = yield* handle("request-password-reset", {
      email: credentials.email,
      redirectTo: "https://app.test/reset-password",
    });
    expect(reset.status).toBe(200);
    const resetEmail = emails.find((email) => email.template === "reset-password");
    expect(resetEmail).toBeDefined();
    const token = new URL(resetEmail!.props.url).pathname.split("/").at(-1);
    const resetBody = { token, newPassword: "replacement-password-123" };
    expect((yield* handle("reset-password", resetBody)).status).toBe(200);
    expect(yield* service.getSession(new Headers({ cookie: nativeCookies }))).toBeNull();
    expect((yield* handle("reset-password", resetBody)).status).toBe(400);
    expect((yield* handle("sign-in/email", credentials)).status).toBe(401);
    expect(
      (yield* handle("sign-in/email", { ...credentials, password: resetBody.newPassword })).status,
    ).toBe(200);
  }),
);

it.effect(
  "rejects untrusted callback and native redirects while allowing the configured scheme",
  () =>
    Effect.gen(function* () {
      const auth = createAuth(
        {
          db: {} as DatabaseClient,
          baseURL: "https://app.test",
          secret: "test-only-auth-secret-at-least-32-characters",
          trustedOrigins: ["https://app.test", "avenire://"],
        },
        memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      );
      for (const [callbackURL, expected] of [
        ["https://attacker.test/stolen", 403],
        ["attacker://callback", 403],
        ["avenire://callback", 400],
      ] as const) {
        const response = yield* Effect.promise(() =>
          auth.handler(
            new Request(
              `https://app.test/api/auth/verify-email?token=invalid&callbackURL=${encodeURIComponent(callbackURL)}`,
            ),
          ),
        );
        // A trusted callback proceeds to token verification; it is never redirected
        // to an arbitrary origin, even when supplied with a malformed token.
        if (expected === 403) expect(response.status).toBe(403);
        else {
          expect(response.status).toBe(302);
          expect(response.headers.get("location")).toMatch(/^avenire:\/\/callback/);
        }
      }
    }),
);
