import { NextResponse, type NextRequest } from "next/server";
import { logoutRemote } from "@/lib/server/api";
import {
  clearSessionCookie,
  isSameOriginRequest,
  readSessionCookie,
} from "@/lib/server/session";

/**
 * Logout outcome contract:
 * - localCleared: true  -> the local session cookie was cleared (always when
 *   this route accepts the request); the response sets the clearing cookie.
 * - revoked: true       -> the backend confirmed the token is revoked.
 * - revoked: false      -> revocation failed or could not be confirmed
 *   (backend unreachable/rejected); the UI must not claim success.
 * - revoked: null       -> there was no token to revoke; already signed out.
 * Origin-rejected requests return 403 without localCleared and do NOT
 * touch the cookie.
 */
export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ message: "Invalid request origin." }, { status: 403 });
  }

  const token = readSessionCookie(req);
  let revoked: boolean | null = null;
  if (token) {
    try {
      const result = await logoutRemote(token);
      revoked = result.ok;
    } catch {
      revoked = false;
    }
  }

  const res = NextResponse.json({
    message:
      revoked === false
        ? "Local session cleared. Server token revocation could not be confirmed."
        : "Logged out successfully.",
    localCleared: true,
    revoked,
  });
  res.headers.set("Cache-Control", "no-store");
  clearSessionCookie(req, res);
  return res;
}
