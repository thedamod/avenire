/** UploadThing's supported, size-bound signing API. Never log credentials or signed URLs. */
export async function prepareUploadThingSource(
  token: string,
  customId: string,
  options: { contentType: string; sizeBytes: number; expiresInSeconds: number },
  acl: "private" | "public-read",
): Promise<{ url: string; key: string }> {
  const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8")) as { apiKey?: unknown };
  if (typeof decoded.apiKey !== "string") throw new Error("Invalid storage configuration");
  const response = await fetch("https://api.uploadthing.com/v7/prepareUpload", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: { "content-type": "application/json", "x-uploadthing-api-key": decoded.apiKey },
    body: JSON.stringify({
      fileName: customId.split("/").at(-1),
      fileSize: options.sizeBytes,
      fileType: options.contentType,
      customId,
      acl,
      expiresIn: options.expiresInSeconds,
    }),
  });
  if (!response.ok) throw new Error(`Storage signing failed (${response.status})`);
  const result = (await response.json()) as { key?: unknown; url?: unknown };
  if (typeof result.key !== "string" || typeof result.url !== "string")
    throw new Error("Invalid storage signing response");
  const url = new URL(result.url);
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9]+\.ingest\.uploadthing\.com$/.test(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== `/${result.key}` ||
    // UploadThing percent-encodes values before adding them to URLSearchParams.
    // Reading the query removes the outer encoding, leaving the encoded custom ID.
    url.searchParams.get("x-ut-custom-id") !== encodeURIComponent(customId) ||
    url.searchParams.get("x-ut-file-size") !== String(options.sizeBytes)
  )
    throw new Error("Unexpected storage signing response");
  return { url: url.href, key: result.key };
}
