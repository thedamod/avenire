import type { IngestionJob, IngestionStatus } from "@avenire/contracts";

const WORKING: ReadonlySet<IngestionStatus> = new Set([
  "queued",
  "extracting",
  "chunking",
  "embedding",
  "graphing",
  "foldering",
]);

const STAGE_LABELS: Partial<Record<IngestionStatus, string>> = {
  queued: "Waiting to read",
  extracting: "Reading",
  chunking: "Reading",
  embedding: "Indexing",
  graphing: "Linking ideas",
  foldering: "Finding a notebook",
};

export type IngestionState =
  | { readonly kind: "processing"; readonly label: string }
  | { readonly kind: "paused" }
  | { readonly kind: "failed"; readonly reason: string }
  | { readonly kind: "password" }
  | { readonly kind: "paywall" }
  | { readonly kind: "login"; readonly site: string | null };

/** The index was committed before the optional extraction retry was scheduled. */
export function isPublishedPartialRetry(job: IngestionJob | undefined): boolean {
  return job?.status === "queued" && job.error === "Partial extraction; retry scheduled.";
}

/** What a source row should say about its job; null once searchable content is available. */
export function ingestionState(job: IngestionJob | undefined): IngestionState | null {
  if (!job || isPublishedPartialRetry(job)) return null;
  if (WORKING.has(job.status))
    return {
      kind: "processing",
      label:
        job.status === "queued" && job.error
          ? /rate limit|quota|tokens per (?:day|minute)|429/i.test(job.error)
            ? "Waiting for AI quota"
            : "Waiting to retry"
          : (STAGE_LABELS[job.status] ?? "Reading"),
    };
  if (job.status === "paused") return { kind: "paused" };
  const detail = [
    job.error ?? "",
    ...(job.coverage?.parts.map((part) => part.detail ?? "") ?? []),
  ].join(" ");
  if (/paywall|subscri/i.test(detail)) return { kind: "paywall" };
  if (job.status === "indexed") return null;
  if (/password|encrypt/i.test(detail)) return { kind: "password" };
  if (/log ?in|sign ?in|auth|401|403/i.test(detail))
    return { kind: "login", site: detail.match(/\b([a-z0-9-]+\.)+[a-z]{2,}\b/i)?.[0] ?? null };
  if (job.status === "failed")
    return { kind: "failed", reason: job.error ?? "Something went wrong." };
  return null;
}
