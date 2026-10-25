import type { SessionUser } from "@avenire/contracts";
import { UserId } from "@avenire/contracts";
import { user, session, account, verification } from "@avenire/database/schema";
import { Database, type DatabaseClient } from "@avenire/database/client";
import { Mailer } from "@avenire/emailer/mailer";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { expo } from "@better-auth/expo";
import { nextCookies } from "better-auth/next-js";
import { oneTimeToken } from "better-auth/plugins/one-time-token";
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
  /** Starts delivery and returns at once: better-auth callbacks must not wait on the mail provider. */
  readonly sendEmail: (message: AuthEmail) => void;
}

export interface AuthEmail {
  readonly template: "verify-email" | "reset-password";
  readonly to: string;
  readonly name: string;
  readonly url: string;
}

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
        options.sendEmail({
          template: "reset-password",
          to: authUser.email,
          name: authUser.name,
          url,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user: authUser, url }) => {
        options.sendEmail({
          template: "verify-email",
          to: authUser.email,
          name: authUser.name,
          url,
        });
      },
    },
    ...(options.google === undefined ? {} : { socialProviders: { google: options.google } }),
    plugins: [
      expo(),
      oneTimeToken({ storeToken: "hashed", expiresIn: 1, disableClientRequest: true }),
      nextCookies(),
    ],
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

/** Expo Go sends `exp://<metro-host>:<port>/--/` as the origin; a dev build sends `avenire://`. */
const DEV_ORIGINS: ReadonlyArray<string> =
  process.env.NODE_ENV === "production" ? [] : ["exp://*/**"];

export const AuthLive = Layer.effect(
  AuthService,
  Effect.gen(function* () {
    const config = yield* AuthConfig;
    const database = yield* Database;
    const mailer = yield* Mailer;
    const services = yield* Effect.context();
    const google = Option.all({
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
    });
    const auth = createAuth({
      db: database.db,
      baseURL: config.baseURL,
      secret: Redacted.value(config.secret),
      trustedOrigins: Option.match(config.trustedOrigins, {
        onNone: () => [config.baseURL, "avenire://", ...DEV_ORIGINS],
        onSome: (value) => [
          ...new Set([config.baseURL, "avenire://", ...DEV_ORIGINS, ...parseOrigins(value)]),
        ],
      }),
      ...Option.match(google, { onNone: () => ({}), onSome: (google) => ({ google }) }),
      // Fire and forget, so a slow or failing provider neither delays the response nor reveals
      // whether an address has an account. A failed send is logged; the user can ask again.
      sendEmail: ({ template, to, name, url }) =>
        Effect.runForkWith(services)(
          mailer
            .send({ template, to, props: { name, url } })
            .pipe(
              Effect.catchTag("EmailSendError", (error) =>
                Effect.logWarning("Auth email failed", { template, error: error.message }),
              ),
            ),
        ),
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
                sessionId: result.session.id,
                email: result.user.email,
                name: result.user.name,
              },
        ),
        Effect.withSpan("AuthService.getSession"),
      ),
  });
