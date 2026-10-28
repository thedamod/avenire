import { FilesError, type Files, type SignedUpload } from "files-sdk";

/** Direct uploads are offered only when the SDK can enforce the ticket's type and size. */
export async function prepareSourceUpload(
  files: Files,
  key: string,
  options: { contentType: string; sizeBytes: number; expiresInSeconds: number },
): Promise<SignedUpload | null> {
  if (!files.capabilities.signedUrl.supported) return null;
  try {
    return await files.signedUploadUrl(key, {
      contentType: options.contentType,
      minSize: options.sizeBytes,
      maxSize: options.sizeBytes,
      expiresIn: options.expiresInSeconds,
    });
  } catch (error) {
    // Like the SDK gateway, use the authenticated relay when presigning is unavailable.
    if (error instanceof FilesError && error.code === "Provider") return null;
    throw error;
  }
}
