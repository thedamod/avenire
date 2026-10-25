import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import { type ComponentType, createElement } from "react";
import { render } from "@react-email/render";
import { Resend } from "resend";

import { subjects, type TemplateName, type TemplateProps, templates } from "./templates/index.ts";

export class EmailSendError extends Schema.TaggedError<EmailSendError>()("EmailSendError", {
  template: Schema.String,
  /** Set when the provider answered without throwing but reported no message. */
  detail: Schema.optional(Schema.String),
  /** True when trying again can succeed: network trouble, a rate limit or a provider 5xx. */
  retryable: Schema.optional(Schema.Boolean),
  cause: Schema.optional(Schema.Defect()),
}) {
  override get message(): string {
    const detail =
      this.detail ?? (this.cause instanceof Error ? this.cause.message : String(this.cause));
    return `Could not send ${this.template} email: ${detail}`;
  }
}

export interface SendRequest<N extends TemplateName> {
  readonly to: string;
  readonly template: N;
  readonly props: TemplateProps<N>;
  /** Resend drops a repeat of the same key for 24 hours, so replaying a send is safe. */
  readonly idempotencyKey?: string;
}

export class Mailer extends Context.Service<
  Mailer,
  {
    readonly send: <N extends TemplateName>(
      request: SendRequest<N>,
    ) => Effect.Effect<{ readonly id: string }, EmailSendError>;
  }
>()("avenire/emailer/Mailer") {}

export const MailerConfig = Config.all({
  apiKey: Config.option(Config.Redacted("RESEND_API_KEY")),
  from: Config.String("EMAIL_FROM").pipe(Config.withDefault("Avenire <hello@avenire.space>")),
});

/** What the mailer needs from Resend: `client.emails.send` with its error as a value. */
export type ResendSend = (
  payload: { from: string; to: string; subject: string; html: string; text: string },
  options?: { idempotencyKey?: string },
) => Promise<{
  data: { id: string } | null;
  error: { message: string; statusCode: number | null; name: string } | null;
}>;

const QUOTA_ERRORS = new Set(["daily_quota_exceeded", "monthly_quota_exceeded"]);

/** Transient provider trouble is worth another try; a rejected request or a spent quota is not. */
export const isRetryableResendError = (error: {
  readonly statusCode: number | null;
  readonly name: string;
}): boolean =>
  !QUOTA_ERRORS.has(error.name) &&
  (error.statusCode === null || error.statusCode === 429 || error.statusCode >= 500);

const SEND_RETRY = {
  schedule: Schedule.exponential("500 millis"),
  times: 2,
  while: (error: EmailSendError) => error.retryable === true,
} as const;

interface RenderedEmail {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly template: TemplateName;
  readonly idempotencyKey: string | undefined;
}

const renderEmail = <N extends TemplateName>({
  to,
  template,
  props,
  idempotencyKey,
}: SendRequest<N>) =>
  Effect.tryPromise({
    try: async (): Promise<RenderedEmail> => {
      // The registry's mapped type can't be indexed generically; the key and props are tied by N.
      const element = createElement(templates[template] as ComponentType<TemplateProps<N>>, props);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return { to, subject: subjects[template](props), html, text, template, idempotencyKey };
    },
    catch: (cause) => new EmailSendError({ template, cause }),
  });

/** A Mailer that renders the template, then hands the result to `deliver`. */
const makeMailer = (
  deliver: (email: RenderedEmail) => Effect.Effect<{ readonly id: string }, EmailSendError>,
): Mailer["Service"] =>
  Mailer.of({
    send: (request) =>
      renderEmail(request).pipe(
        Effect.flatMap(deliver),
        Effect.withSpan("Mailer.send", { attributes: { template: request.template } }),
      ),
  });

export const MailerConsole = Layer.succeed(
  Mailer,
  makeMailer(({ to, subject, text, template }) =>
    Effect.logInfo("Email rendered", { to, subject, text }).pipe(
      Effect.as({ id: `console-${template}` }),
    ),
  ),
);

/** The Resend-backed Mailer for any `send` function, so tests need no network. */
export const makeResendMailer = (send: ResendSend, from: string): Mailer["Service"] =>
  makeMailer(({ to, subject, html, text, template, idempotencyKey }) =>
    Effect.tryPromise({
      try: () =>
        send({ from, to, subject, html, text }, idempotencyKey ? { idempotencyKey } : undefined),
      // The SDK reports API failures as values; a throw here is the network or the client.
      catch: (cause) => new EmailSendError({ template, retryable: true, cause }),
    }).pipe(
      Effect.flatMap(({ data, error }) => {
        if (error)
          return Effect.fail(
            new EmailSendError({
              template,
              retryable: isRetryableResendError(error),
              detail: error.message,
            }),
          );
        if (!data) return Effect.fail(new EmailSendError({ template, detail: "no message id" }));
        return Effect.succeed({ id: data.id });
      }),
      Effect.retry(SEND_RETRY),
    ),
  );

export const MailerResend = Layer.effect(
  Mailer,
  Effect.gen(function* () {
    const apiKey = yield* Config.Redacted("RESEND_API_KEY");
    const { from } = yield* MailerConfig;
    const client = new Resend(Redacted.value(apiKey));
    return makeResendMailer((payload, options) => client.emails.send(payload, options), from);
  }),
);

/** Resend when `RESEND_API_KEY` is set, otherwise log rendered emails to the console. */
export const MailerLive = Layer.unwrap(
  MailerConfig.pipe(
    Effect.map((config) => (Option.isSome(config.apiKey) ? MailerResend : MailerConsole)),
  ),
);
