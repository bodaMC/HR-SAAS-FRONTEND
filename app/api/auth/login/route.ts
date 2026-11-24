import { NextResponse, type NextRequest } from "next/server";
import { loginWithPassword } from "@/lib/server/api";
import { isSameOriginRequest, setSessionCookie } from "@/lib/server/session";

function json(body: unknown, status: number, retryAfter?: string | null) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  if (retryAfter) res.headers.set("Retry-After", retryAfter);
  return res;
}

const GENERIC_UNAVAILABLE =
  "The authentication service is unavailable. Please try again later.";

/**
 * App-owned messages for the known safe backend 403 codes. Membership is
 * checked with own-key lookup, never `in` (prototype keys are not codes).
 */
const SAFE_403_MESSAGES = new Map<string, string>([
  ["USER_INACTIVE", "Your user account is inactive."],
  ["COMPANY_INACTIVE", "Your company account is inactive."],
]);
const GENERIC_403 = "Access denied. Please contact your administrator.";

/**
 * Known backend 422 validation messages for email/password, mapped to
 * app-owned equivalents. Any other string - including internal exception
 * text without punctuation - becomes a generic field error. Backend text
 * is never forwarded verbatim unless it is an exact known-safe match.
 */
const KNOWN_422_MESSAGES = new Map<string, string>([
  ["These credentials do not match our records.", "These credentials do not match our records."],
  ["The email field is required.", "Email is required."],
  ["The password field is required.", "Password is required."],
  ["The email field must be a valid email address.", "Please enter a valid email address."],
]);
const GENERIC_FIELD_ERROR = "Invalid value.";

/**
 * 422 handling keeps ONLY email/password validation errors mapped through
 * the allowlist above, under an app-owned top-level message. Unknown
 * fields and non-string entries are dropped entirely.
 */
function constrained422(data: { errors?: unknown } | null) {
  const errors: Record<string, string[]> = {};
  const source =
    data && typeof data === "object" && data.errors && typeof data.errors === "object"
      ? (data.errors as Record<string, unknown>)
      : {};
  for (const field of ["email", "password"] as const) {
    const messages = source[field];
    if (Array.isArray(messages)) {
      const mapped = messages
        .filter((m): m is string => typeof m === "string")
        .map((m) => KNOWN_422_MESSAGES.get(m) ?? GENERIC_FIELD_ERROR);
      const unique = [...new Set(mapped)];
      if (unique.length > 0) errors[field] = unique;
    }
  }
  return { message: "Please review the highlighted fields.", errors };
}

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return json({ message: "Invalid request origin." }, 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ message: "Invalid request body." }, 400);
  }

  const email =
    typeof (body as { email?: unknown })?.email === "string"
      ? (body as { email: string }).email
      : "";
  const password =
    typeof (body as { password?: unknown })?.password === "string"
      ? (body as { password: string }).password
      : "";

  const errors: Record<string, string[]> = {};
  if (!email) errors.email = ["Email is required."];
  if (!password) errors.password = ["Password is required."];
  if (Object.keys(errors).length > 0) {
    return json({ message: "Please review the highlighted fields.", errors }, 422);
  }

  let result;
  try {
    result = await loginWithPassword(email, password);
  } catch {
    return json({ message: GENERIC_UNAVAILABLE }, 502);
  }

  if (!result.ok) {
    // Network failure or backend 5xx: never leak internal responses.
    if (result.status === null || result.status >= 500) {
      return json({ message: GENERIC_UNAVAILABLE }, 502);
    }
    if (result.status === 422) {
      const data = result.data as { errors?: unknown } | null;
      return json(constrained422(data), 422);
    }
    if (result.status === 403) {
      // Only known safe codes map to app-owned messages; backend message
      // text is never forwarded.
      const data = result.data as { code?: unknown } | null;
      const code = typeof data?.code === "string" ? data.code : null;
      const safe = code !== null ? SAFE_403_MESSAGES.get(code) : undefined;
      if (code !== null && safe !== undefined) {
        return json({ message: safe, code }, 403);
      }
      return json({ message: GENERIC_403 }, 403);
    }
    if (result.status === 429) {
      return json(
        { message: "Too many login attempts. Please try again later." },
        429,
        result.retryAfter,
      );
    }
    return json({ message: "Sign in failed. Please try again." }, 502);
  }

  const data = result.data;
  if (!data?.token || !data?.user) {
    return json({ message: GENERIC_UNAVAILABLE }, 502);
  }

  // The bearer token is stored server-side in an HttpOnly cookie only.
  // It is never returned to the browser.
  const res = json({ user: data.user, company: data.company ?? null }, 200);
  setSessionCookie(req, res, data.token);
  return res;
}
