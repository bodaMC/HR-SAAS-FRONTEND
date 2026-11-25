import "server-only";
/**
 * Same-origin BFF mutation plumbing for Phase 3 write routes.
 *
 * - Mutations only proceed for same-origin requests (CSRF/trusted-origin
 *   policy preserved from Phase 2 session helpers).
 * - The Sanctum token is read from the HttpOnly session cookie and never
 *   exposed to the browser; responses are never cached.
 * - ALL upstream failure bodies are sanitized to app-owned status-keyed
 *   messages (401/403/404/409/429 preserved, Retry-After kept on 429;
 *   everything else, including an unreachable backend, surfaces as a
 *   generic 503). No raw backend text ever crosses to the browser.
 * - Mutation success bodies are minimized and validated before forwarding
 *   ({data:{id}} with a positive-integer id for create/update,
 *   {message:"ok"} for delete).
 */
import { NextResponse, type NextRequest } from "next/server";
import { mutateApi } from "@/lib/server/api";
import { isSameOriginRequest, readSessionCookie } from "@/lib/server/session";
import { sanitize422 } from "@/lib/server/validation-errors";

function json(body: unknown, status: number, retryAfter?: string | null) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  if (retryAfter) res.headers.set("Retry-After", retryAfter);
  return res;
}

/** App-owned failure bodies keyed by status: raw backend text (SQL errors,
 * stack traces, policy messages) never crosses to the browser. Retry-After
 * is preserved on 429. */
function failureBody(status: number): { body: Record<string, string>; status: number } {
  if (status === 401) return { body: { message: "session_expired" }, status: 401 };
  if (status === 403) return { body: { message: "forbidden" }, status: 403 };
  if (status === 404) return { body: { message: "not_found" }, status: 404 };
  if (status === 409) return { body: { message: "conflict" }, status: 409 };
  if (status === 429) return { body: { message: "rate_limited" }, status: 429 };
  return { body: { message: "unavailable" }, status: 503 };
}

export async function handleMutation(
  req: NextRequest,
  method: "POST" | "PUT" | "DELETE",
  path: string,
  allowedFields: readonly string[],
): Promise<NextResponse> {
  if (!isSameOriginRequest(req)) {
    /* Distinct code: an untrusted/mismatched origin (for example Production
     * Mode on plain http://localhost without ORBIT_ALLOW_INSECURE_LOCAL_ORIGIN)
     * is a configuration problem, never reported as a permission denial. The
     * check itself is unchanged. */
    return json({ message: "untrusted_origin" }, 403);
  }
  const token = readSessionCookie(req);
  if (!token) {
    return json({ message: "unauthenticated" }, 401);
  }
  let body: unknown;
  if (method !== "DELETE") {
    try {
      const parsed: unknown = await req.json();
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return json({ message: "invalid_request" }, 400);
      }
      // Strip anything outside the form-request field set (never forward
      // company_id, non-writable flags, or unknown keys).
      const clean: Record<string, unknown> = {};
      for (const field of allowedFields) {
        if (field in (parsed as Record<string, unknown>)) {
          clean[field] = (parsed as Record<string, unknown>)[field];
        }
      }
      body = clean;
    } catch {
      return json({ message: "invalid_request" }, 400);
    }
  }
  const r = await mutateApi(token, method, path, body);
  if (r.status === null) {
    return json({ message: "unavailable" }, 503);
  }
  if (r.status === 422) {
    const sanitized = sanitize422(r.data, allowedFields);
    if (sanitized) return json(sanitized, 422);
    return json({ message: "validation", errors: {} }, 422);
  }
  if (!r.ok) {
    const f = failureBody(r.status ?? 500);
    return json(f.body, f.status, r.retryAfter);
  }
  /* Success bodies are minimized and shape-checked: a mutation response is
   * only trustworthy if it carries the resource envelope with a usable id
   * (POST/PUT), and DELETE needs no body at all. A malformed success is
   * reported as unavailable instead of leaking unknown content. */
  if (method === "DELETE") {
    return json({ message: "ok" }, 200);
  }
  const data = r.data as { data?: { id?: unknown } } | null | undefined;
  const id = data?.data?.id;
  /* Resource ids are positive integers per the contract; anything else is
   * a malformed success and must not cross to the browser. */
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
    return json({ message: "unavailable" }, 503);
  }
  return json({ data: { id } }, r.status ?? 200);
}
