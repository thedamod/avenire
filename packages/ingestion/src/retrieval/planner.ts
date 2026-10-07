/** Splits a multi-part question into standalone aspects for deep search. */
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export class PlannerError extends Schema.TaggedError<PlannerError>()("PlannerError", {
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return "Planning the search failed";
  }
}

export class QueryPlanner extends Context.Service<
  QueryPlanner,
  {
    /** At most four aspects; empty when the question has only one part. */
    readonly plan: (question: string) => Effect.Effect<ReadonlyArray<string>, PlannerError>;
  }
>()("avenire/ingestion/QueryPlanner") {}
