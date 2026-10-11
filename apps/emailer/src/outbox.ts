/**
 * Drains the Postgres email outbox. Rows are leased (send_after pushed forward)
 * when claimed, so a crashed worker's rows become claimable again after the lease.
 */
import { Database, type DatabaseClient } from "@avenire/database/client";
import { emailOutbox } from "@avenire/database/schema";
import { Mailer, type SendRequest } from "@avenire/emailer/mailer";
import { type TemplateName, TemplatePropsSchema } from "@avenire/emailer/templates";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20;
const CONCURRENCY = 5;
const IDLE_DELAY = "5 seconds";
const OUTAGE_DELAY = "15 seconds";

const TemplateNameSchema = Schema.Literals(
  Object.keys(TemplatePropsSchema) as [TemplateName, ...Array<TemplateName>],
);

/** A row returned by the claim update. */
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

export const claimBatchQuery = (db: DatabaseClient) => {
  const due = db
    .select({ id: emailOutbox.id })
    .from(emailOutbox)
    .where(and(eq(emailOutbox.status, "pending"), lte(emailOutbox.sendAfter, sql`now()`)))
    .orderBy(emailOutbox.sendAfter)
    .limit(BATCH_SIZE)
    .for("update", { skipLocked: true });
  return db
    .update(emailOutbox)
    .set({
      sendAfter: sql`now() + interval '5 minutes'`,
      attempts: sql`${emailOutbox.attempts} + 1`,
    })
    .where(inArray(emailOutbox.id, due))
    .returning({
      id: emailOutbox.id,
      to_address: emailOutbox.toAddress,
      template: emailOutbox.template,
      props: emailOutbox.props,
      attempts: emailOutbox.attempts,
    });
};

const decodeRequest = (row: ClaimedEmail) =>
  Effect.gen(function* () {
    const template = yield* Schema.decodeUnknownEffect(TemplateNameSchema)(row.template);
    const props = yield* Schema.decodeUnknownEffect(TemplatePropsSchema[template])(row.props);
    // `props` was decoded with the schema selected by `template`, so the pair is consistent.
    return { to: row.to_address, template, props } as SendRequest<TemplateName>;
  });

export const OutboxWorker = Layer.effectDiscard(
  Effect.gen(function* () {
    const database = yield* Database;
    const mailer = yield* Mailer;

    const claimBatch = database
      .use(claimBatchQuery)
      .pipe(Effect.flatMap(decodeClaimed), Effect.withSpan("OutboxWorker.claimBatch"));

    const markSent = (id: string) =>
      database.use((db) =>
        db
          .update(emailOutbox)
          .set({ status: "sent", sentAt: sql`now()`, lastError: null })
          .where(eq(emailOutbox.id, id)),
      );

    const markFailed = (id: string, error: string) =>
      database.use((db) =>
        db
          .update(emailOutbox)
          .set({ status: "failed", lastError: error })
          .where(eq(emailOutbox.id, id)),
      );

    const markRetry = (row: ClaimedEmail, error: string) => {
      const state = nextState(row.attempts, error);
      return state.status === "failed"
        ? markFailed(row.id, error)
        : database.use((db) =>
            db
              .update(emailOutbox)
              .set({
                status: "pending",
                lastError: error,
                sendAfter: sql`now() + (${state.backoffMinutes} * interval '1 minute')`,
              })
              .where(eq(emailOutbox.id, row.id)),
          );
    };

    /** Malformed rows will never succeed, so they fail immediately instead of retrying. */
    const dropMalformed = (row: ClaimedEmail, error: Schema.SchemaError) =>
      markFailed(row.id, `Malformed outbox row: ${error.message}`).pipe(
        Effect.andThen(Effect.logWarning("Dropped malformed outbox row", { id: row.id })),
      );

    const deliver = (row: ClaimedEmail, request: SendRequest<TemplateName>) =>
      mailer.send(request).pipe(
        Effect.flatMap(({ id }) =>
          markSent(row.id).pipe(
            Effect.andThen(
              Effect.logInfo("Sent email", {
                id: row.id,
                template: request.template,
                messageId: id,
              }),
            ),
          ),
        ),
        Effect.catchTag("EmailSendError", (error) =>
          markRetry(row, error.message).pipe(
            Effect.andThen(
              Effect.logWarning("Email send failed", {
                id: row.id,
                attempts: row.attempts,
                error: error.message,
              }),
            ),
          ),
        ),
      );

    // One row's database error must not interrupt the other sends in its batch;
    // the row keeps its lease and is retried once the lease expires.
    const processRow = Effect.fn("OutboxWorker.processRow")(
      function* (row: ClaimedEmail) {
        yield* decodeRequest(row).pipe(
          Effect.matchEffect({
            onFailure: (error) => dropMalformed(row, error),
            onSuccess: (request) => deliver(row, request),
          }),
        );
      },
      Effect.catchTag("DatabaseError", (error) =>
        Effect.logError("Could not update outbox row", { error }),
      ),
    );

    /** One poll: process whatever was claimed and report whether there was work. */
    const drainOnce = claimBatch.pipe(
      Effect.tap((rows) =>
        Effect.forEach(rows, processRow, { concurrency: CONCURRENCY, discard: true }),
      ),
      Effect.map((rows) => rows.length > 0),
    );

    const poll = drainOnce.pipe(
      Effect.flatMap((hadWork) => (hadWork ? Effect.void : Effect.sleep(IDLE_DELAY))),
      // A database outage must not kill the worker: log, back off, keep polling.
      Effect.catchCause((cause) =>
        Effect.logError("Outbox poll failed", cause).pipe(
          Effect.andThen(Effect.sleep(OUTAGE_DELAY)),
        ),
      ),
    );

    yield* Effect.forkScoped(Effect.repeat(poll, Schedule.forever));
  }),
);
