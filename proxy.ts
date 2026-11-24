import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/server/session";

/**
 * Route protection (Next.js proxy convention, formerly middleware).
 *
 * Checks for the presence of the session cookie and redirects unauthenticated
 * visitors to /login. The session is still validated server-side against
 * GET /api/v1/auth/me on every protected render; the cookie alone is never
 * treated as proof of authentication.
 */
export function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico|icon.png|brand/).*)"],
};
