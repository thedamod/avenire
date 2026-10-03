/**
 * Drains the Postgres email outbox. Rows are leased (send_after pushed forward)
 * when claimed, so a crashed worker's rows become claimable again after the lease.
 */
import { Database } from "@avenire/database/client";
import { Mailer } from "@avenire/emailer/mailer";
import {
  type TemplateName,
  type TemplateProps,
  TemplatePropsSchema,
} from "@avenire/emailer/templates";
import { sql } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20;
const CONCURRENCY = 5;
const LEASE = sql`interval '5 minutes'`;

const TemplateNameSchema = Schema.Literals(
  Object.keys(TemplatePropsSchema) as [TemplateName, ...Array<TemplateName>],
);

const ClaimedEmail = Schema.Struct({
  id: Schema.String,
  to_address: Schema.String,
  template: Schema.String,
  props: Schema.Unknown,
  attempts: Schema.Number,
});
type ClaimedEmail = typeof ClaimedEmail.Type;
const decodeClaimed = Schema.decodeUnknownEffect(Schema.Array(ClaimedEmail));

export const backoffMinutes = (attempts: number): number => 2 ** attempts;

export type NextState =
  | { readonly status: "failed"; readonly lastError: string }
  | { readonly status: "pending"; readonly lastError: string; readonly backoffMinutes: number };

export const nextState = (attempts: number, error: string): NextState =>
  attempts >= MAX_ATTEMPTS
    ? { status: "failed", lastError: error }
    : { status: "pending", lastError: error, backoffMinutes: backoffMinutes(attempts) };

const execute = (statement: ReturnType<typeof sql>) =>
  Effect.flatMap(Effect.service(Database), (database) =>
    database.use((db) => db.execute(statement)),
  );

const claimBatch = execute(sql`
  UPDATE email_outbox
  SET send_after = now() + ${LEASE}, attempts = attempts + 1
  WHERE id IN (
    SELECT id FROM email_outbox
    WHERE status = 'pending' AND send_after <= now()
    ORDER BY send_after
    FOR UPDATE SKIP LOCKED
    LIMIT ${BATCH_SIZE}
  )
  RETURNING id, to_address, template, props, attempts
`).pipe(Effect.flatMap(decodeClaimed), Effect.withSpan("OutboxWorker.claimBatch"));

const markSent = (id: string) =>
  execute(
    sql`UPDATE email_outbox SET status = 'sent', sent_at = now(), last_error = NULL WHERE id = ${id}`,
  );

/** Malformed rows will never succeed, so they fail immediately instead of retrying. */
const markFailed = (id: string, error: string) =>
  execute(sql`UPDATE email_outbox SET status = 'failed', last_error = ${error} WHERE id = ${id}`);

const markRetry = (row: ClaimedEmail, error: string) => {
  const state = nextState(row.attempts, error);
  return state.status === "failed"
    ? markFailed(row.id, error)
    : execute(sql`
        UPDATE email_outbox
        SET status = 'pending', last_error = ${error},
            send_after = now() + (${state.backoffMinutes} * interval '1 minute')
        WHERE id = ${row.id}
      `);
};

const decodeRequest = (row: ClaimedEmail) =>
  Effect.gen(function* () {
    const template = yield* Schema.decodeUnknownEffect(TemplateNameSchema)(row.template);
    const props = yield* Schema.decodeUnknownEffect(TemplatePropsSchema[template])(row.props);
    // `props` was decoded with the schema selected by `template`, so the pair is consistent.
    return { to: row.to_address, template, props } as {
      readonly to: string;
      readonly template: TemplateName;
      readonly props: TemplateProps<TemplateName>;
    };
  });

const processRow = Effect.fn("OutboxWorker.processRow")(function* (row: ClaimedEmail) {
  const mailer = yield* Mailer;
  yield* decodeRequest(row).pipe(
    Effect.matchEffect({
      onFailure: (issue) =>
        markFailed(row.id, `Malformed outbox row: ${issue.message}`).pipe(
          Effect.andThen(Effect.logWarning("Dropped malformed outbox row", { id: row.id })),
        ),
      onSuccess: (request) =>
        mailer.send(request).pipe(
          Effect.matchEffect({
            onSuccess: ({ id }) =>
              markSent(row.id).pipe(
                Effect.andThen(
                  Effect.logInfo("Sent email", {
                    id: row.id,
                    template: request.template,
                    messageId: id,
                  }),
                ),
              ),
            onFailure: (error) =>
              markRetry(row, error.message).pipe(
                Effect.andThen(
                  Effect.logWarning("Email send failed", { id: row.id, attempts: row.attempts }),
                ),
              ),
          }),
        ),
    }),
  );
});

/** One poll: process whatever was claimed and report whether there was work. */
const drainOnce = claimBatch.pipe(
  Effect.tap((rows) =>
    Effect.forEach(rows, processRow, { concurrency: CONCURRENCY, discard: true }),
  ),
  Effect.map((rows) => rows.length > 0),
);

const loop = drainOnce.pipe(
  Effect.flatMap((hadWork) => (hadWork ? Effect.void : Effect.sleep("5 seconds"))),
  // A database outage must not kill the worker: log, back off, keep polling.
  Effect.catchCause((cause) =>
    Effect.logError("Outbox poll failed", cause).pipe(Effect.andThen(Effect.sleep("15 seconds"))),
  ),
  Effect.repeat(Schedule.forever),
);

export const OutboxWorker = Layer.effectDiscard(Effect.forkScoped(loop));
