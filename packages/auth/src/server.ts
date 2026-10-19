import type { SessionUser } from "@avenire/contracts";
import { UserId } from "@avenire/contracts";
import { emailOutbox, user, session, account, verification } from "@avenire/database/schema";
import { Database, type DatabaseClient } from "@avenire/database/client";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { expo } from "@better-auth/expo";
import { nextCookies } from "better-auth/next-js";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

export interface CreateAuthOptions {
  readonly db: DatabaseClient;
  readonly baseURL: string;
  readonly secret: string;
  readonly trustedOrigins: ReadonlyArray<string>;
  readonly google?: { readonly clientId: string; readonly clientSecret: string };
}

// Runs inside better-auth callbacks (plain promises), so ids come from Web Crypto here.
const enqueueEmail = (
  db: DatabaseClient,
  template: "verify-email" | "reset-password",
  toAddress: string,
  name: string,
  url: string,
) =>
  db.insert(emailOutbox).values({
    id: crypto.randomUUID(),
    toAddress,
    template,
    props: { name, url },
  });

export const createAuth = (
  options: CreateAuthOptions,
  database: BetterAuthOptions["database"] = drizzleAdapter(options.db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
) =>
  betterAuth({
    baseURL: options.baseURL,
    basePath: "/api/auth",
    secret: options.secret,
    trustedOrigins: [...options.trustedOrigins],
    advanced: { disableOriginCheck: false, disableCSRFCheck: false },
    database,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user: authUser, url }) => {
        await enqueueEmail(options.db, "reset-password", authUser.email, authUser.name, url);
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user: authUser, url }) => {
        await enqueueEmail(options.db, "verify-email", authUser.email, authUser.name, url);
      },
    },
    ...(options.google === undefined ? {} : { socialProviders: { google: options.google } }),
    plugins: [expo(), nextCookies()],
  });

export type Auth = ReturnType<typeof createAuth>;

export class AuthError extends Schema.TaggedError<AuthError>()("AuthError", {
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return "Could not resolve the session";
  }
}

export const AuthConfig = Config.all({
  secret: Config.Redacted("BETTER_AUTH_SECRET"),
  baseURL: Config.String("BETTER_AUTH_URL"),
  trustedOrigins: Config.option(Config.String("AUTH_TRUSTED_ORIGINS")),
  googleClientId: Config.option(Config.String("GOOGLE_CLIENT_ID")),
  googleClientSecret: Config.option(Config.String("GOOGLE_CLIENT_SECRET")),
});

export class AuthService extends Context.Service<
  AuthService,
  {
    readonly auth: Auth;
    readonly getSession: (headers: Headers) => Effect.Effect<SessionUser | null, AuthError>;
  }
>()("avenire/auth/AuthService") {}

export const parseOrigins = (value: string): ReadonlyArray<string> =>
  value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

export const AuthLive = Layer.effect(
  AuthService,
  Effect.gen(function* () {
    const config = yield* AuthConfig;
    const database = yield* Database;
    const google = Option.all({
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
    });
    const auth = createAuth({
      db: database.db,
      baseURL: config.baseURL,
      secret: Redacted.value(config.secret),
      trustedOrigins: Option.match(config.trustedOrigins, {
        onNone: () => [config.baseURL, "avenire://"],
        onSome: (value) => [...new Set([config.baseURL, "avenire://", ...parseOrigins(value)])],
      }),
      ...Option.match(google, { onNone: () => ({}), onSome: (google) => ({ google }) }),
    });

    return makeAuthService(auth);
  }),
);

/** Resolve every protected request against the session store, including revocations. */
export const makeAuthService = (auth: Auth): AuthService["Service"] =>
  AuthService.of({
    auth,
    getSession: (headers) =>
      Effect.tryPromise({
        try: () => auth.api.getSession({ headers, query: { disableCookieCache: true } }),
        catch: (cause) => new AuthError({ cause }),
      }).pipe(
        Effect.map((result): SessionUser | null =>
          result === null
            ? null
            : {
                id: UserId.make(result.user.id),
                email: result.user.email,
                name: result.user.name,
              },
        ),
        Effect.withSpan("AuthService.getSession"),
      ),
  });
