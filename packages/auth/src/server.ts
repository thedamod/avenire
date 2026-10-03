import type { SessionUser } from "@avenire/contracts";
import { UserId } from "@avenire/contracts";
import { emailOutbox, user, session, account, verification } from "@avenire/database/schema";
import { Database, type DatabaseClient } from "@avenire/database/client";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth";
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

export const createAuth = (options: CreateAuthOptions) =>
  betterAuth({
    baseURL: options.baseURL,
    secret: options.secret,
    trustedOrigins: [...options.trustedOrigins],
    database: drizzleAdapter(options.db, {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
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
}) {}

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

export const AuthLive = Layer.effect(
  AuthService,
  Effect.gen(function* () {
    const config = yield* AuthConfig;
    const database = yield* Database;
    const trustedOrigins = Option.isSome(config.trustedOrigins)
      ? config.trustedOrigins.value
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean)
      : [config.baseURL, "avenire://"];
    const google =
      Option.isSome(config.googleClientId) && Option.isSome(config.googleClientSecret)
        ? { clientId: config.googleClientId.value, clientSecret: config.googleClientSecret.value }
        : undefined;
    const auth = createAuth({
      db: database.db,
      baseURL: config.baseURL,
      secret: Redacted.value(config.secret),
      trustedOrigins,
      ...(google === undefined ? {} : { google }),
    });

    return AuthService.of({
      auth,
      getSession: (headers) =>
        Effect.tryPromise({
          try: async () => {
            const result = await auth.api.getSession({ headers });
            return result === null
              ? null
              : {
                  id: UserId.make(result.user.id),
                  email: result.user.email,
                  name: result.user.name,
                };
          },
          catch: (cause) => new AuthError({ cause }),
        }),
    });
  }),
);
