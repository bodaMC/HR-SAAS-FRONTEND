import "server-only";
/**
 * Per-page validated-session guard for protected pages.
 *
 * Every protected page calls this BEFORE issuing any other private read or
 * rendering any private content. It never relies on the shared layout:
 * layouts persist across client navigations and are not an authorization
 * boundary. The session token is validated against GET /api/v1/auth/me on
 * every page render; Laravel remains the final authorization on each
 * endpoint call afterwards.
 */
import { cookies } from "next/headers";
import { fetchMe, type ApiResult } from "@/lib/server/api";
import { SESSION_COOKIE } from "@/lib/server/session";
import type { ApiCompany, ApiUser } from "@/lib/types";

export type SessionGuard =
  | { ok: true; token: string; user: ApiUser; company: ApiCompany | null }
  | { ok: false; reason: "no-token" | "expired" | "inactive" | "unavailable" };

export async function requireSession(): Promise<SessionGuard> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return { ok: false, reason: "no-token" };

  let me: ApiResult<{ user?: ApiUser | null; company?: ApiCompany | null }>;
  try {
    me = await fetchMe(token);
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (me.status === 401) return { ok: false, reason: "expired" };
  if (me.status === 403) return { ok: false, reason: "inactive" };
  if (!me.ok || !me.data || typeof me.data !== "object" || !me.data.user || !me.data.user.id) {
    // Unreachable, 5xx, or a malformed success payload: never treat as a
    // valid session and never render private content.
    return { ok: false, reason: "unavailable" };
  }

  const user = me.data.user;
  const company = me.data.company ?? user.company ?? null;
  if (user.is_active === false || company?.is_active === false) {
    return { ok: false, reason: "inactive" };
  }
  return { ok: true, token, user, company };
}
