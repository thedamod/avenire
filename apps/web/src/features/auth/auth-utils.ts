/** Resolve against a fixed origin to reject protocol-relative, backslash and encoded redirects. */
export function safeCallbackURL(value: string | null | undefined): string {
  if (
    !value ||
    !value.startsWith("/") ||
    Array.from(value).some((char) => char === "\\" || char.charCodeAt(0) <= 32)
  )
    return "/";
  try {
    const url = new URL(value, "https://avenire.invalid");
    if (url.origin !== "https://avenire.invalid") return "/";
    const decoded = decodeURIComponent(url.pathname);
    if (decoded.startsWith("//") || decoded.includes("\\")) return "/";
    if (
      /^\/(sign-in|sign-up|login|register|verify-email|forgot-password|reset-password)(\/|$)/.test(
        url.pathname,
      )
    )
      return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
export const MIN_PASSWORD_LENGTH = 8; // Better Auth default; server has no override.
export type AuthMode =
  | "sign-in"
  | "sign-up"
  | "verify-email"
  | "forgot-password"
  | "reset-password";
