/** Session cookies belong only to the API origin, never a storage or third-party host. */
export async function assetRequest(
  value: string,
  apiUrl: string,
  getCookieHeader: () => Promise<Record<string, string>>,
) {
  const url = new URL(value, apiUrl);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password)
    throw new Error("This media URL is not supported.");
  const headers = url.origin === new URL(apiUrl).origin ? await getCookieHeader() : {};
  return { uri: url.toString(), headers };
}
