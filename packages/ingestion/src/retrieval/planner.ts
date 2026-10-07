/** Splits a multi-part question into standalone aspects for deep search. */
import { generateText, Output } from "ai";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { IngestionModels } from "../models.ts";

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

const PlanOutput = Schema.Struct({ aspects: Schema.Array(Schema.String) });
const output = Output.object({
  schema: Schema.toStandardJSONSchemaV1(Schema.toStandardSchemaV1(PlanOutput)),
});

export const cleanAspects = (
  question: string,
  aspects: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const seen = new Set<string>([question.trim().toLowerCase()]);
  const result: string[] = [];
  for (const value of aspects) {
    const text = value.trim();
    const key = text.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length === 4) break;
  }
  return result;
};

export const QueryPlannerLive = Layer.effect(
  QueryPlanner,
  Effect.gen(function* () {
    const models = yield* IngestionModels;
    return QueryPlanner.of({
      plan: Effect.fn("QueryPlanner.plan")(function* (question) {
        const result = yield* Effect.tryPromise({
          try: (abortSignal) =>
            generateText({
              model: models.languageModel("ingest-planner"),
              system:
                "Split a multi-part, comparison, or multi-hop study question into at most four standalone sub-questions. Each must be answerable from one passage. Resolve references like 'it' to their named subject. Return an empty aspects array for a single-part question.",
              prompt: question,
              output,
              abortSignal,
            }),
          catch: (cause) => new PlannerError({ cause }),
        });
        return cleanAspects(question, result.output.aspects);
      }),
    });
  }),
);

const wordCount = (text: string): number => text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
export const splitTestAspects = (question: string): ReadonlyArray<string> => {
  const parts = question
    .split(/\s+(?:and|vs\.?|versus|compared to)\s+|;/iu)
    .map((part) => part.trim());
  return parts.length > 1 && parts.every((part) => wordCount(part) >= 3)
    ? cleanAspects(question, parts)
    : [];
};

export const QueryPlannerTest = Layer.succeed(
  QueryPlanner,
  QueryPlanner.of({
    plan: (question) => Effect.succeed(splitTestAspects(question)),
  }),
);
