import * as Effect from "effect/Effect";
import { NextResponse, type NextRequest } from "next/server";
import { WidgetHost, WidgetHostLive, widgetHostDecision } from "./server/widgetHost.ts";

export async function middleware(request: NextRequest) {
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
    path.startsWith("/api/") ||
    path.startsWith("/_next/") ||
    path === "/favicon.ico"
  )
    return NextResponse.next();
  const authenticated =
    request.cookies.has("better-auth.session_token") ||
    request.cookies.has("__Secure-better-auth.session_token");
  const authRoute = path === "/sign-in" || path === "/sign-up";
  if (!authenticated && !authRoute) return NextResponse.redirect(new URL("/sign-in", request.url));
  if (authenticated && authRoute) return NextResponse.redirect(new URL("/", request.url));
  return NextResponse.next();
}

// APIs and static assets must also pass through the widget-host isolation check.
export const config = { matcher: ["/:path*"] };
