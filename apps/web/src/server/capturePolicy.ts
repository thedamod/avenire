import { captureCandidates } from "@avenire/capture/candidates";
import type { CaptureSnapshot, UserSettings } from "@avenire/contracts";

/** Shared candidates plus the owner's `paywalledPages` choice for pages they couldn't read either. */
export const prepareCapture = (
  snapshot: CaptureSnapshot,
  hash: (text: string) => string,
  paywalledPages: UserSettings["paywalledPages"],
) => {
  const prepared = captureCandidates(snapshot, hash);
  const skipped = [...prepared.skipped];
  const candidates = prepared.candidates.flatMap((candidate) => {
    const stub = candidate.access !== undefined && candidate.access !== "open";
    if (stub && paywalledPages === "skip") {
      skipped.push({
        title: candidate.title,
        reason:
          candidate.access === "paywalled"
            ? "Skipped paywalled page by your capture settings."
            : "Skipped page requiring login by your capture settings.",
      });
      return [];
    }
    return [
      {
        ...candidate,
        text: stub ? undefined : candidate.text,
        stub,
        summary: stub ? (candidate.summary ?? null) : null,
      },
    ];
  });
  return { ...prepared, candidates, skipped };
};
