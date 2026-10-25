import * as Effect from "effect/Effect";
import { NextResponse, type NextRequest } from "next/server";
import { WidgetHost, WidgetHostLive, widgetHostDecision } from "./server/widgetHost.ts";

// Brand files must load on the sign-in page and in email clients, which have no session.
const PUBLIC_ASSETS = new Set(["/favicon.ico", "/icon.svg", "/apple-icon.png"]);

export async function proxy(request: NextRequest) {
  const widgetHost = await Effect.runPromise(
    Effect.map(WidgetHost, (policy) => policy.host).pipe(Effect.provide(WidgetHostLive)),
  );
  const path = request.nextUrl.pathname;
  const decision = widgetHostDecision(
    request.headers.get("host") ?? request.nextUrl.host,
    path,
    widgetHost,
  );
  if (decision === "reject") return new NextResponse(null, { status: 404 });
  if (decision === "widget") return NextResponse.next();
  if (
    path.startsWith("/a/") ||
    // Document-only shell: PDF bytes use their own signed URL, never an app session.
    path.startsWith("/source-preview/") ||
    path.startsWith("/api/") ||
    path.startsWith("/_next/") ||
    PUBLIC_ASSETS.has(path) ||
    path.startsWith("/branding/")
  )
    return NextResponse.next();
  // This hint only avoids a redirect. HTTP/RPC handlers validate the actual
  // session against Better Auth before reading or mutating any user data.
  const hasSessionHint = Boolean(
    request.cookies.get("better-auth.session_token")?.value ||
    request.cookies.get("__Secure-better-auth.session_token")?.value,
  );
  const authRoute = [
    "/sign-in",
    "/sign-up",
    "/verify-email",
    "/forgot-password",
    "/reset-password",
    "/login",
    "/register",
  ].includes(path);
  if (!hasSessionHint && !authRoute) {
    const signIn = new URL("/sign-in", request.url);
    if (path === "/desktop/authorize")
      signIn.searchParams.set("callbackURL", path + request.nextUrl.search);
    return NextResponse.redirect(signIn);
  }
  // Stale or forged cookies must not prevent users from reaching sign-in.
  return NextResponse.next();
}

// Next clones matched request bodies into memory. Source uploads stream directly
// to disk; their handlers enforce widget-host isolation, sessions and origins.
export const config = { matcher: ["/((?!api/library/uploads(?:/|$)).*)"] };
