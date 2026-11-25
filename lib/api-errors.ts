/**
 * Client-safe mapping from a BFF failure (HTTP status + app-owned `message`
 * code) to a localized dictionary key. The codes are produced only by
 * lib/server/bff.ts; raw backend text never reaches the browser.
 *
 *   untrusted_origin  -> request blocked by the same-origin / trusted-origin
 *                        check (configuration problem, NOT a permission issue)
 *   forbidden         -> the backend denied this user (real permission denial)
 *   unauthenticated / session_expired -> sign in again
 *   rate_limited, not_found, conflict, unavailable (backend unreachable/5xx),
 *   validation (422, field-level)
 */
export type FailureCode =
  | "untrusted_origin"
  | "forbidden"
  | "unauthenticated"
  | "session_expired"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "unavailable"
  | "validation"
  | "invalid_request";

const KNOWN: readonly string[] = [
  "untrusted_origin",
  "forbidden",
  "unauthenticated",
  "session_expired",
  "not_found",
  "conflict",
  "rate_limited",
  "unavailable",
  "validation",
  "invalid_request",
];

export function readFailureCode(body: unknown): FailureCode | null {
  const m = (body as { message?: unknown } | null)?.message;
  return typeof m === "string" && KNOWN.includes(m) ? (m as FailureCode) : null;
}

/** Dictionary key for a failed response; `forbiddenKey` lets a screen keep its own wording. */
export function failureKey(
  status: number,
  code: FailureCode | null,
  forbiddenKey: string,
  fallbackKey: string,
): string {
  if (code === "untrusted_origin") return "forms.untrustedOrigin";
  if (code === "session_expired" || code === "unauthenticated" || status === 401) return "forms.status401";
  if (code === "forbidden" || status === 403) return forbiddenKey;
  if (code === "not_found" || status === 404) return "forms.status404";
  if (code === "conflict" || status === 409) return "forms.status409";
  if (code === "rate_limited" || status === 429) return "forms.status429";
  if (code === "unavailable" || status === 503) return "forms.unavailable";
  return fallbackKey;
}
