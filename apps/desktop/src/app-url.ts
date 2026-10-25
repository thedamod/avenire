/** One origin for navigation, cookies, uploads and OAuth. Never silently change servers. */
export function validateAppUrl(value: string): string {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
  )
    throw new Error("AVENIRE_APP_URL must be an HTTPS origin (HTTP is allowed on localhost only)");
  return url.origin;
}
