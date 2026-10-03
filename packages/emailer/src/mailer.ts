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
import type { TemplateName, TemplateProps } from "./templates/index.ts";
import { subjects, templates } from "./templates/index.ts";

export class EmailSendError extends Schema.TaggedError<EmailSendError>()("EmailSendError", {
  template: Schema.String,
  cause: Schema.Defect(),
}) {}

export class Mailer extends Context.Service<
  Mailer,
  {
    readonly send: <N extends TemplateName>(request: {
      readonly to: string;
      readonly template: N;
      readonly props: TemplateProps<N>;
    }) => Effect.Effect<{ readonly id: string }, EmailSendError>;
  }
>()("avenire/emailer/Mailer") {}

export const MailerConfig = Config.all({
  apiKey: Config.option(Config.Redacted("RESEND_API_KEY")),
  from: Config.String("EMAIL_FROM").pipe(Config.withDefault("Avenire <hello@avenire.space>")),
});

const renderEmail = <N extends TemplateName>(template: N, props: TemplateProps<N>) =>
  // The registry's mapped type can't be indexed generically; the key and props are tied by N.
  createElement(templates[template] as ComponentType<TemplateProps<N>>, props);

const makeMailer = (
  send: (message: {
    readonly to: string;
    readonly subject: string;
    readonly html: string;
    readonly text: string;
    readonly template: TemplateName;
  }) => Effect.Effect<{ readonly id: string }, EmailSendError>,
): Mailer["Service"] =>
  Mailer.of({
    send: <N extends TemplateName>({
      to,
      template,
      props,
    }: {
      readonly to: string;
      readonly template: N;
      readonly props: TemplateProps<N>;
    }) => {
      const subject = subjects[template](props);
      return Effect.tryPromise({
        try: async () => {
          const element = renderEmail(template, props);
          const [html, text] = await Promise.all([
            render(element),
            render(element, { plainText: true }),
          ]);
          return { subject, html, text };
        },
        catch: (cause) => new EmailSendError({ template, cause }),
      }).pipe(
        Effect.flatMap(({ subject: renderedSubject, html, text }) =>
          send({ to, subject: renderedSubject, html, text, template }),
        ),
      );
    },
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
    const config = yield* MailerConfig;
    if (Option.isNone(config.apiKey))
      return yield* Effect.die(new Error("RESEND_API_KEY is required for MailerResend"));
    const client = new Resend(Redacted.value(config.apiKey.value));
    return makeMailer(({ to, subject, html, text, template }) =>
      Effect.tryPromise({
        try: () => client.emails.send({ from: config.from, to, subject, html, text }),
        catch: (cause) => new EmailSendError({ template, cause }),
      }).pipe(
        Effect.flatMap((result) =>
          result.error
            ? Effect.fail(new EmailSendError({ template, cause: result.error }))
            : result.data
              ? Effect.succeed({ id: result.data.id })
              : Effect.fail(
                  new EmailSendError({
                    template,
                    cause: new Error("Resend returned no email data"),
                  }),
                ),
        ),
      ),
    );
  }),
);

export const MailerLive = Layer.unwrap(
  MailerConfig.pipe(
    Effect.map((config) => (Option.isSome(config.apiKey) ? MailerResend : MailerConsole)),
  ),
);
