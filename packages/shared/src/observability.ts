/**
 * Server-side observability: structured logs plus PostHog product analytics and
 * error tracking, exposed as one `Analytics` service.
 *
 * PostHog is optional. Without `POSTHOG_KEY` the service is a no-op, so local
 * development and tests never need credentials.
 *
 * @module Observability
 */
import * as Cause from "effect/Cause";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import { PostHog } from "posthog-node";

export type AnalyticsProperties = Readonly<Record<string, string | number | boolean | null>>;

export interface AnalyticsEvent {
  readonly distinctId: string;
  readonly event: string;
  readonly properties?: AnalyticsProperties;
}

export class Analytics extends Context.Service<
  Analytics,
  {
    readonly capture: (event: AnalyticsEvent) => Effect.Effect<void>;
    readonly captureException: (
      cause: Cause.Cause<unknown>,
      context: { readonly distinctId?: string; readonly properties?: AnalyticsProperties },
    ) => Effect.Effect<void>;
  }
>()("avenire/observability/Analytics") {}

const noop: Analytics["Service"] = {
  capture: () => Effect.void,
  captureException: () => Effect.void,
};

export const AnalyticsConfig = Config.all({
  key: Config.option(Config.Redacted("POSTHOG_KEY")),
  host: Config.String("POSTHOG_HOST").pipe(Config.withDefault("https://us.i.posthog.com")),
});

/** PostHog-backed analytics. Flushes queued events when the layer's scope closes. */
export const AnalyticsLive = Layer.effect(
  Analytics,
  Effect.gen(function* () {
    const config = yield* AnalyticsConfig;
    if (Option.isNone(config.key)) {
      yield* Effect.logDebug("POSTHOG_KEY not set; analytics disabled");
      return noop;
    }
    const apiKey = Redacted.value(config.key.value);
    const client = yield* Effect.acquireRelease(
      Effect.sync(() => new PostHog(apiKey, { host: config.host, flushAt: 20 })),
      (client) => Effect.promise(() => client.shutdown()).pipe(Effect.ignore),
    );
    return {
      capture: (event) =>
        Effect.sync(() =>
          client.capture({
            distinctId: event.distinctId,
            event: event.event,
            ...(event.properties === undefined ? {} : { properties: { ...event.properties } }),
          }),
        ),
      captureException: (cause, context) =>
        Effect.sync(() =>
          client.captureException(
            Cause.squash(cause),
            context.distinctId,
            context.properties ? { ...context.properties } : undefined,
          ),
        ),
    };
  }),
);

export const AnalyticsNoop = Layer.succeed(Analytics, noop);

/** JSON logs in production, pretty logs everywhere else. */
export const LoggerLive = Layer.unwrap(
  Effect.gen(function* () {
    const env = yield* Config.String("NODE_ENV").pipe(Config.withDefault("development"));
    return Logger.layer([env === "production" ? Logger.consoleJson : Logger.consolePretty()]);
  }),
);

/** Everything a server process needs for observability. */
export const ObservabilityLive = Layer.mergeAll(AnalyticsLive, LoggerLive);

/**
 * Report unexpected failures (defects and errors) to PostHog without changing
 * the effect's outcome. Use at process and request boundaries, not in every service.
 */
export const reportFailures =
  (context: { readonly distinctId?: string; readonly operation: string }) =>
  <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R | Analytics> =>
    Effect.tapCause(self, (cause) =>
      Cause.hasInterruptsOnly(cause)
        ? Effect.void
        : Effect.flatMap(Effect.service(Analytics), (analytics) =>
            analytics.captureException(cause, {
              ...(context.distinctId === undefined ? {} : { distinctId: context.distinctId }),
              properties: { operation: context.operation },
            }),
          ),
    );
