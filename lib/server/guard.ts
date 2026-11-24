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
 *
 * The /me identity payload is also shape-validated at runtime: a 200 with
 * a user object whose fields have wrong types (for example a non-string
 * name) is treated as unavailable, so malformed identity data can never
 * reach the render tree and crash it.
 */
import { cookies } from "next/headers";
import { fetchMe, type ApiResult } from "@/lib/server/api";
import { SESSION_COOKIE } from "@/lib/server/session";
import type { ApiCompany, ApiUser } from "@/lib/types";

export type SessionGuard =
  | { ok: true; token: string; user: ApiUser; company: ApiCompany | null }
  | { ok: false; reason: "no-token" | "expired" | "inactive" | "unavailable" };

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Only the fields the app consumes are checked, against the verified contract. */
function validUserShape(u: unknown): u is ApiUser {
  if (!isPlainRecord(u)) return false;
  if (typeof u.id !== "number" && typeof u.id !== "string") return false;
  if (typeof u.name !== "string") return false;
  if (typeof u.email !== "string") return false;
  if (typeof u.role !== "string") return false;
  if (u.is_active !== undefined && typeof u.is_active !== "boolean") return false;
  return true;
}

function validCompanyShape(c: unknown): c is ApiCompany | null {
  if (c === null || c === undefined) return true;
  if (!isPlainRecord(c)) return false;
  if (typeof c.name !== "string") return false;
  if (c.is_active !== undefined && typeof c.is_active !== "boolean") return false;
  return true;
}

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
  if (!me.ok || !me.data || typeof me.data !== "object") {
    // Unreachable, 5xx, or a malformed success payload: never treat as a
    // valid session and never render private content.
    return { ok: false, reason: "unavailable" };
  }

  const user: unknown = me.data.user;
  if (!validUserShape(user)) {
    // Structurally invalid identity (missing id, non-string name/email/role):
    // fail closed instead of risking a render crash or a guessed identity.
    return { ok: false, reason: "unavailable" };
  }
  const rawCompany: unknown = me.data.company ?? user.company ?? null;
  if (!validCompanyShape(rawCompany)) {
    return { ok: false, reason: "unavailable" };
  }
  const company = rawCompany ?? null;
  if (user.is_active === false || company?.is_active === false) {
    return { ok: false, reason: "inactive" };
  }
  return { ok: true, token, user, company };
}
