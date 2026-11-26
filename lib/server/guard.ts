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
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fetchMe, type ApiResult } from "@/lib/server/api";
import { SESSION_COOKIE } from "@/lib/server/session";
import { parseAccess, type Capabilities } from "@/lib/access";
import type { ApiCompany, ApiUser } from "@/lib/types";

export type SessionGuard =
  | { ok: true; token: string; user: ApiUser; company: ApiCompany | null; caps: Capabilities }
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
  if (u.must_change_password !== undefined && typeof u.must_change_password !== "boolean") return false;
  return true;
}

function validCompanyShape(c: unknown): c is ApiCompany | null {
  if (c === null || c === undefined) return true;
  if (!isPlainRecord(c)) return false;
  if (typeof c.name !== "string") return false;
  if (c.is_active !== undefined && typeof c.is_active !== "boolean") return false;
  return true;
}

/**
 * Request-scoped memoization (React cache): the protected layout and the page
 * both call this during ONE render pass, which used to issue GET /auth/me
 * twice. cache() is scoped to the current request only, so the result is
 * never shared between users or requests. Security is unchanged: every
 * request still validates the token against /auth/me.
 */
export const requireSession = cache(async function requireSessionUncached(): Promise<SessionGuard> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return { ok: false, reason: "no-token" };

  let me: ApiResult<{ user?: ApiUser | null; company?: ApiCompany | null; access?: unknown }>;
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
  // Phase 3.3: a temporary-password session may only use the first-login page. The backend enforces the same rule
  // on every API call; this keeps the UI from rendering pages whose data calls would all be refused.
  if (user.must_change_password === true) redirect("/first-login");
  return { ok: true, token, user, company, caps: parseAccess(me.data.access) };
});
