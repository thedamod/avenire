/** Only web links can leave the desktop shell; OS protocols never come from page content. */
export function externalUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export function isAppUrl(value: string, appUrl: string): boolean {
  const safe = externalUrl(value);
  return safe !== undefined && new URL(safe).origin === new URL(appUrl).origin;
}

export function isAssetUrl(value: string, appUrl: string): boolean {
  return isAppUrl(value, appUrl) && /^\/a\/[\w-]+\.[\w-]+$/.test(new URL(value).pathname);
}
