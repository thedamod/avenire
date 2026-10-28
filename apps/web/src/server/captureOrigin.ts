import type { CaptureOrigin, UserId } from "@avenire/contracts";
import { normalizeUrl } from "@avenire/capture/url";
import type { DatabaseTransaction } from "@avenire/database/client";
import { advanceCorpusRevision, refreshFolderCentroidsTx } from "@avenire/database/corpus";
import { fileFolder } from "@avenire/database/schema";
import { and, eq, inArray } from "drizzle-orm";

/** Reopen provenance retains safe query parameters; citation URLs never carry queries. */
export const captureCitationUrl = (origin: CaptureOrigin): string | null => {
  if (origin._tag !== "Web") return null;
  const url = new URL(origin.finalUrl ?? origin.url);
  url.search = "";
  url.hash = "";
  return url.toString();
};

export const normalizeCaptureOrigin = (origin: CaptureOrigin): CaptureOrigin =>
  origin._tag === "LocalFile"
    ? origin.originUrl === undefined
      ? origin
      : { ...origin, originUrl: normalizeUrl(origin.originUrl) }
    : {
        ...origin,
        url: normalizeUrl(origin.url),
        ...(origin.finalUrl === undefined ? {} : { finalUrl: normalizeUrl(origin.finalUrl) }),
        ...(origin.canonicalUrl === undefined
          ? {}
          : { canonicalUrl: normalizeUrl(origin.canonicalUrl) }),
      };

/**
 * A recapture that un-archives files puts their chunks back in the active corpus. Only then do
 * their notebooks' centroids and the corpus revision change; new or re-uploaded files reach the
 * corpus through ingestion's own publication.
 */
export const restoreToCorpusTx = async (
  tx: DatabaseTransaction,
  userId: UserId,
  fileIds: readonly string[],
): Promise<void> => {
  if (fileIds.length === 0) return;
  const links = await tx
    .select({ folderId: fileFolder.folderId })
    .from(fileFolder)
    .where(and(eq(fileFolder.userId, userId), inArray(fileFolder.fileId, [...fileIds])));
  await refreshFolderCentroidsTx(tx, userId, [...new Set(links.map((link) => link.folderId))]);
  await advanceCorpusRevision(tx, userId);
};
