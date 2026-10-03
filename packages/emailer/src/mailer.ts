import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { type ComponentType, createElement } from "react";
import { render } from "@react-email/render";
import { Resend } from "resend";

import { subjects, type TemplateName, type TemplateProps, templates } from "./templates/index.ts";

export class EmailSendError extends Schema.TaggedError<EmailSendError>()("EmailSendError", {
  template: Schema.String,
  /** Set when the provider answered without throwing but reported no message. */
  detail: Schema.optional(Schema.String),
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

interface RenderedEmail {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly template: TemplateName;
}

const renderEmail = <N extends TemplateName>({ to, template, props }: SendRequest<N>) =>
  Effect.tryPromise({
    try: async (): Promise<RenderedEmail> => {
      // The registry's mapped type can't be indexed generically; the key and props are tied by N.
      const element = createElement(templates[template] as ComponentType<TemplateProps<N>>, props);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return { to, subject: subjects[template](props), html, text, template };
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

export const MailerResend = Layer.effect(
  Mailer,
  Effect.gen(function* () {
    const apiKey = yield* Config.Redacted("RESEND_API_KEY");
    const { from } = yield* MailerConfig;
    const client = new Resend(Redacted.value(apiKey));
    return makeMailer(({ to, subject, html, text, template }) =>
      Effect.tryPromise({
        try: () => client.emails.send({ from, to, subject, html, text }),
        catch: (cause) => new EmailSendError({ template, cause }),
      }).pipe(
        Effect.flatMap(({ data, error }) => {
          if (error) return Effect.fail(new EmailSendError({ template, cause: error }));
          if (!data) return Effect.fail(new EmailSendError({ template, detail: "no message id" }));
          return Effect.succeed({ id: data.id });
        }),
      ),
    );
  }),
);

/** Resend when `RESEND_API_KEY` is set, otherwise log rendered emails to the console. */
export const MailerLive = Layer.unwrap(
  MailerConfig.pipe(
    Effect.map((config) => (Option.isSome(config.apiKey) ? MailerResend : MailerConsole)),
  ),
);
