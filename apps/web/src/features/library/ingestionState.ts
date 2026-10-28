import type { IngestionJob, IngestionStatus, LibraryFile } from "@avenire/contracts";

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

/** What `ingestionState` reads from the file: its typed access and where it came from. */
export type AccessFile = Pick<LibraryFile, "access" | "origin" | "sourceUrl">;

function siteOf(file: AccessFile): string | null {
  const url = file.origin?._tag === "Web" ? file.origin.url : file.sourceUrl;
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.hostname.replace(/^www\./, "")
      : null;
  } catch {
    return null;
  }
}

/**
 * What a source row should say about its job; null once searchable content is available.
 * Paywall and login states come from `file.access`, never from error text. Pass `null` only
 * where nothing but the processing state matters.
 */
export function ingestionState(
  job: IngestionJob | undefined,
  file: AccessFile | null,
): IngestionState | null {
  const working = !!job && !isPublishedPartialRetry(job) && WORKING.has(job.status);
  // A re-capture after logging in is read again; until then the stub keeps its access state.
  if (!working && job?.status !== "paused") {
    if (file?.access === "paywalled") return { kind: "paywall" };
    if (file?.access === "login-required") return { kind: "login", site: siteOf(file) };
  }
  if (!job || isPublishedPartialRetry(job)) return null;
  if (working)
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
  if (job.status === "indexed") return null;
  if (/password|encrypt/i.test(detail)) return { kind: "password" };
  if (job.status === "failed")
    return { kind: "failed", reason: job.error ?? "Something went wrong." };
  return null;
}
