import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const authenticated =
    request.cookies.has("better-auth.session_token") ||
    request.cookies.has("__Secure-better-auth.session_token");
  const authRoute =
    request.nextUrl.pathname === "/sign-in" || request.nextUrl.pathname === "/sign-up";

  if (!authenticated && !authRoute) return NextResponse.redirect(new URL("/sign-in", request.url));
  if (authenticated && authRoute) return NextResponse.redirect(new URL("/", request.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"] };
