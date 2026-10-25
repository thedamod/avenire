/** Signed byte URLs stay in the fragment, out of server logs and referrers. */
export function previewContentUrl(fragment: string): string | null {
  const value = new URLSearchParams(fragment.replace(/^#/, "")).get("url");
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
