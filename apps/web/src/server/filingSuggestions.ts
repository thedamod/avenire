import { judgeFiling, type FilingVerdict } from "@avenire/ai/filing-judge";
import type { FileId, FolderSuggestions, UserId } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { filingContexts, type FilingContext } from "@avenire/ingestion/folder";
import type { LanguageModel } from "ai";
import * as Effect from "effect/Effect";

const CACHE_LIMIT = 1_000;

/**
 * The judge's pick leads, with other embedding suggestions after it. When the judge finds no fit,
 * a confident embedding match (already above the suggestion floor) still stands, and the judge's
 * new-notebook name is offered next to it. Without a verdict, embeddings only.
 */
export const composeSuggestions = (
  context: FilingContext,
  verdict: FilingVerdict | null,
): FolderSuggestions => {
  if (verdict === null)
    return { fileId: context.fileId, suggestions: context.ranked, newNotebook: null };
  if (verdict.folderId === null)
    return {
      fileId: context.fileId,
      suggestions: context.ranked,
      newNotebook: verdict.newNotebook,
    };
  const chosen = verdict.folderId;
  return {
    fileId: context.fileId,
    suggestions: [
      {
        folderId: chosen,
        similarity: context.ranked.find((row) => row.folderId === chosen)?.similarity ?? null,
      },
      ...context.ranked.filter((row) => row.folderId !== chosen),
    ].slice(0, 3),
    newNotebook: null,
  };
};

/** A verdict holds while the file's content and the shortlist it was judged against don't change. */
const cacheKey = (userId: UserId, context: FilingContext) =>
  [
    userId,
    context.fileId,
    context.contentHash ?? context.title,
    ...context.candidates.map((row) => `${row.folderId}:${row.name}:${row.samples.join("|")}`),
  ].join("\u0000");

/**
 * Save-to suggestions: an embedding shortlist judged by a small model that may answer "none,
 * start a new notebook". Without a model, or when the judge fails, embedding suggestions stand.
 */
export const makeFilingSuggester = (model: LanguageModel | undefined) => {
  const verdicts = new Map<string, FilingVerdict>();
  const judge = (userId: UserId, context: FilingContext) => {
    if (!model || context.candidates.length === 0) return Effect.succeed(null);
    const key = cacheKey(userId, context);
    const cached = verdicts.get(key);
    if (cached) return Effect.succeed(cached);
    return judgeFiling(model, context).pipe(
      Effect.tap((verdict) =>
        Effect.sync(() => {
          if (!verdict) return;
          if (verdicts.size >= CACHE_LIMIT) verdicts.delete(verdicts.keys().next().value!);
          verdicts.set(key, verdict);
        }),
      ),
      Effect.catchTag("FilingJudgeError", (error) =>
        Effect.logWarning("Filing judge failed; using embedding suggestions", error.cause).pipe(
          Effect.as(null),
        ),
      ),
    );
  };
  return (userId: UserId, fileIds: readonly FileId[]) =>
    Effect.gen(function* () {
      const contexts = yield* filingContexts(userId, fileIds);
      return yield* Effect.forEach(
        contexts,
        (context) =>
          judge(userId, context).pipe(
            Effect.map((verdict) => composeSuggestions(context, verdict)),
          ),
        { concurrency: 4 },
      );
    }) satisfies Effect.Effect<readonly FolderSuggestions[], unknown, Database>;
};
