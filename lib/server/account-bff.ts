import "server-only";
/**
 * Phase 3.3 BFF plumbing for the login-account lifecycle, My Profile and password change.
 *
 * Same rules as lib/server/bff.ts: same-origin only, the Sanctum token stays in the HttpOnly cookie, bodies are
 * restricted to a field allowlist, and raw backend text never reaches the browser. Two additions:
 * - a one-time temporary password is forwarded to the browser exactly once, as a plain string field, on the
 *   response of the create/reset call that produced it (never stored by the BFF, never logged);
 * - the response carries only the minimized account state, not the raw backend body.
 */
import { NextResponse, type NextRequest } from "next/server";
import { mutateApi, type ApiResult } from "@/lib/server/api";
import { isSameOriginRequest, readSessionCookie } from "@/lib/server/session";
import { sanitize422 } from "@/lib/server/validation-errors";

export function jsonNoStore(body: unknown, status: number, retryAfter?: string | null) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  if (retryAfter) res.headers.set("Retry-After", retryAfter);
  return res;
}

/** Stable, non-sensitive refusal codes that may cross to the browser (code only, never backend text). */
const SAFE_CODES = new Set([
  "already_linked", "account_already_linked", "email_taken", "no_account", "already_inactive", "already_active",
  "employee_terminated", "reactivate_employee_first", "already_terminated", "not_terminated", "confirmation_mismatch",
  "reason_required", "use_lifecycle_action", "PASSWORD_CHANGE_REQUIRED", "TOO_MANY_ATTEMPTS", "forbidden",
]);

export function failure(r: Extract<ApiResult<unknown>, { ok: false }>, allowed: readonly string[]) {
  if (r.status === null) return jsonNoStore({ message: "unavailable" }, 503);
  const raw = (r.data as { code?: unknown } | null | undefined)?.code;
  const code = typeof raw === "string" && SAFE_CODES.has(raw) ? raw : null;
  if (r.status === 422) {
    const s = sanitize422(r.data, allowed);
    return jsonNoStore(s ?? { message: "validation", errors: {} }, 422);
  }
  if (r.status === 401) return jsonNoStore({ message: "session_expired" }, 401);
  if (r.status === 403) {
    // Protected / out-of-authority targets collapse into one code; the real reason stays server-side.
    return jsonNoStore({ message: "forbidden", code: code ?? "protected_denied" }, 403);
  }
  if (r.status === 404) return jsonNoStore({ message: "not_found" }, 404);
  if (r.status === 409) return jsonNoStore({ message: "conflict", ...(code ? { code } : {}) }, 409);
  if (r.status === 429) return jsonNoStore({ message: "rate_limited" }, 429, r.retryAfter);
  return jsonNoStore({ message: "unavailable" }, 503);
}

const ACTIONS = new Set(["reset-password", "deactivate", "reactivate", "unlink", "link"]);

/** Minimizes the backend account state to the fields the UI consumes. */
function minimizeState(v: unknown) {
  if (typeof v !== "object" || v === null) return null;
  const s = v as Record<string, unknown>;
  const actions = (typeof s.actions === "object" && s.actions !== null ? s.actions : {}) as Record<string, unknown>;
  const flag = (k: string) => actions[k] === true;
  if (typeof s.state !== "string") return null;
  return {
    employee_id: s.employee_id, employee_uuid: s.employee_uuid, has_account: s.has_account === true, is_self: s.is_self === true, state: s.state,
    ...(typeof s.login_email === "string" ? { login_email: s.login_email } : {}),
    actions: { create: flag("create"), link: flag("link"), reset_password: flag("reset_password"), deactivate: flag("deactivate"), reactivate: flag("reactivate"), unlink: flag("unlink") },
  };
}

export const ACCOUNT_CREATE_FIELDS = ["email", "password", "status", "confirm_employee_uuid", "reason"] as const;
export const ACCOUNT_ACTION_FIELDS = ["confirm_employee_uuid", "reason", "password", "user_id"] as const;
export const TERMINATE_FIELDS = ["confirm_employee_uuid", "reason", "termination_date"] as const;

export async function handleAccountMutation(
  req: NextRequest,
  path: string,
  fields: readonly string[],
  successStatus = 200,
): Promise<NextResponse> {
  if (!isSameOriginRequest(req)) return jsonNoStore({ message: "untrusted_origin" }, 403);
  const token = readSessionCookie(req);
  if (!token) return jsonNoStore({ message: "unauthenticated" }, 401);
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return jsonNoStore({ message: "invalid_request" }, 400);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return jsonNoStore({ message: "invalid_request" }, 400);
  const clean: Record<string, unknown> = {};
  for (const f of fields) if (f in (parsed as Record<string, unknown>)) clean[f] = (parsed as Record<string, unknown>)[f];
  const r = await mutateApi<{ data?: unknown; temporary_password?: unknown }>(token, "POST", path, clean);
  if (!r.ok) return failure(r, fields);
  const data = minimizeState(r.data?.data);
  if (!data) return jsonNoStore({ message: "unavailable" }, 503);
  const temp = typeof r.data?.temporary_password === "string" ? r.data.temporary_password : null;
  return jsonNoStore({ data, ...(temp ? { temporary_password: temp } : {}) }, r.status === 201 ? 201 : successStatus);
}

/** Terminate / reactivate employee: returns only {message:"ok"}. */
export async function handleEmployeeLifecycle(req: NextRequest, path: string, fields: readonly string[]): Promise<NextResponse> {
  if (!isSameOriginRequest(req)) return jsonNoStore({ message: "untrusted_origin" }, 403);
  const token = readSessionCookie(req);
  if (!token) return jsonNoStore({ message: "unauthenticated" }, 401);
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return jsonNoStore({ message: "invalid_request" }, 400);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return jsonNoStore({ message: "invalid_request" }, 400);
  const clean: Record<string, unknown> = {};
  for (const f of fields) if (f in (parsed as Record<string, unknown>)) clean[f] = (parsed as Record<string, unknown>)[f];
  const r = await mutateApi<unknown>(token, "POST", path, clean);
  if (!r.ok) return failure(r, fields);
  return jsonNoStore({ message: "ok" }, 200);
}

export function accountActionAllowed(a: string): boolean {
  return ACTIONS.has(a);
}

export const PASSWORD_FIELDS = ["current_password", "password", "password_confirmation"] as const;

/** Maps a password-change 422 to stable codes per field (no backend text crosses to the browser). */
function passwordErrors(data: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const errors = (data as { errors?: unknown } | null)?.errors;
  if (typeof errors !== "object" || errors === null) return out;
  const e = errors as Record<string, unknown>;
  const msgs = (k: string) => (Array.isArray(e[k]) ? (e[k] as unknown[]).filter((m): m is string => typeof m === "string") : []);
  if (msgs("current_password").length) out.current_password = ["current_password_wrong"];
  const pw = msgs("password");
  if (pw.length) {
    out.password = [
      ...new Set(
        pw.map((m) =>
          /different/i.test(m) ? "password_same" : /at least/i.test(m) ? "password_min" : /upper|lower/i.test(m) ? "password_letters" : /number/i.test(m) ? "password_numbers" : /confirmation/i.test(m) ? "password_mismatch" : "password_invalid",
        ),
      ),
    ];
  }
  if (msgs("password_confirmation").length) out.password_confirmation = ["password_mismatch"];
  return out;
}

/** POST /auth/change-password: on success the BFF swaps the session cookie for the renewed token. */
export async function handleChangePassword(req: NextRequest, setCookie: (res: NextResponse, token: string) => void): Promise<NextResponse> {
  if (!isSameOriginRequest(req)) return jsonNoStore({ message: "untrusted_origin" }, 403);
  const token = readSessionCookie(req);
  if (!token) return jsonNoStore({ message: "unauthenticated" }, 401);
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return jsonNoStore({ message: "invalid_request" }, 400);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return jsonNoStore({ message: "invalid_request" }, 400);
  const clean: Record<string, unknown> = {};
  for (const f of PASSWORD_FIELDS) if (typeof (parsed as Record<string, unknown>)[f] === "string") clean[f] = (parsed as Record<string, unknown>)[f];
  const r = await mutateApi<{ token?: unknown }>(token, "POST", "/auth/change-password", clean);
  if (!r.ok) {
    if (r.status === 422) return jsonNoStore({ message: "validation", errors: passwordErrors(r.data) }, 422);
    return failure(r, PASSWORD_FIELDS);
  }
  const fresh = r.data?.token;
  if (typeof fresh !== "string" || fresh.length < 20) return jsonNoStore({ message: "unavailable" }, 503);
  const res = jsonNoStore({ message: "ok" }, 200);
  setCookie(res, fresh);
  return res;
}

/** PUT /me/profile (phone only). */
export async function handleProfileUpdate(req: NextRequest): Promise<NextResponse> {
  if (!isSameOriginRequest(req)) return jsonNoStore({ message: "untrusted_origin" }, 403);
  const token = readSessionCookie(req);
  if (!token) return jsonNoStore({ message: "unauthenticated" }, 401);
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return jsonNoStore({ message: "invalid_request" }, 400);
  }
  const phone = (parsed as { phone?: unknown } | null)?.phone;
  if (phone !== null && typeof phone !== "string") return jsonNoStore({ message: "invalid_request" }, 400);
  const r = await mutateApi<unknown>(token, "PUT", "/me/profile", { phone });
  if (!r.ok) return failure(r, ["phone"]);
  return jsonNoStore({ message: "ok" }, 200);
}
