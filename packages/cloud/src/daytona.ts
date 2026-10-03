import { Daytona } from "@daytonaio/sdk";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

export class CloudError extends Schema.TaggedError<CloudError>()("CloudError", {
  operation: Schema.String,
  /** What went wrong when there is no underlying exception, e.g. a non-zero exit code. */
  detail: Schema.optional(Schema.String),
  cause: Schema.optional(Schema.Defect()),
}) {
  override get message(): string {
    const detail =
      this.detail ?? (this.cause instanceof Error ? this.cause.message : String(this.cause));
    return `Sandbox ${this.operation} failed: ${detail}`;
  }
}

export class SandboxTimeout extends Schema.TaggedError<SandboxTimeout>()("SandboxTimeout", {
  operation: Schema.String,
  timeoutSeconds: Schema.Number,
}) {
  override get message(): string {
    return `Sandbox ${this.operation} timed out after ${this.timeoutSeconds} seconds`;
  }
}

export class DaytonaClient extends Context.Service<DaytonaClient, Daytona>()(
  "avenire/cloud/DaytonaClient",
) {}

export const DaytonaConfig = Config.all({
  apiKey: Config.Redacted("DAYTONA_API_KEY"),
  apiUrl: Config.option(Config.String("DAYTONA_API_URL")),
  target: Config.option(Config.String("DAYTONA_TARGET")),
});

export const DaytonaClientLive = Layer.effect(
  DaytonaClient,
  Effect.gen(function* () {
    const config = yield* DaytonaConfig;
    return new Daytona({
      apiKey: Redacted.value(config.apiKey),
      ...Option.match(config.apiUrl, { onNone: () => ({}), onSome: (apiUrl) => ({ apiUrl }) }),
      ...Option.match(config.target, { onNone: () => ({}), onSome: (target) => ({ target }) }),
    });
  }),
);

/** Wrap a Daytona SDK call, attributing failures to `operation`. */
export const attempt = <A>(operation: string, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: (cause) => new CloudError({ operation, cause }) });

/** Shell commands report failure through exit codes, not rejections. */
export const requireSuccess =
  (operation: string) =>
  <R extends { readonly exitCode: number; readonly result: string }>(response: R) =>
    response.exitCode === 0
      ? Effect.succeed(response)
      : Effect.fail(
          new CloudError({
            operation,
            detail: `exit code ${response.exitCode}: ${response.result.slice(-2_000)}`,
          }),
        );

export const decodeBase64 = (encoded: string): Uint8Array =>
  Uint8Array.from(atob(encoded.replace(/^data:[^;]+;base64,/, "")), (char) => char.charCodeAt(0));
