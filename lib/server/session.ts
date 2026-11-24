import "server-only";
/**
 * Server-only session cookie helpers.
 *
 * The Sanctum bearer token is stored in an HttpOnly cookie so it is never
 * readable from browser JavaScript, never appears in URLs or client bundles,
 * and private API responses are never cached.
 */
import { NextResponse, type NextRequest } from "next/server";

export const SESSION_COOKIE = "orbit_session";

/** Matches the backend default Sanctum expiration (10080 minutes = 7 days). */
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function maxAgeSeconds(): number {
  const raw = process.env.ORBIT_SESSION_MAX_AGE;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_AGE_SECONDS;
}

function isLoopbackHost(hostname: string): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(hostname);
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * The explicitly trusted application origin (ORBIT_APP_ORIGIN), required in
 * production. Validation is strict: only http(s) schemes, no credentials,
 * path, query or fragment; an http origin is honored only for loopback
 * hosts, and in production only when the explicit local-test-harness
 * override ORBIT_ALLOW_INSECURE_LOCAL_ORIGIN=true is also set. Anything
 * else is treated as absent, which fails closed below.
 * X-Forwarded-Host is never consulted anywhere in this module.
 */
function trustedAppOrigin(): URL | null {
  const raw = process.env.ORBIT_APP_ORIGIN;
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const strictShape =
    (url.protocol === "https:" || url.protocol === "http:") &&
    url.username === "" &&
    url.password === "" &&
    (url.pathname === "" || url.pathname === "/") &&
    url.search === "" &&
    url.hash === "";
  if (!strictShape) return null;
  if (url.protocol === "https:") return url;
  if (!isLoopbackHost(url.hostname)) return null;
  if (!isProduction()) return url;
  if (process.env.ORBIT_ALLOW_INSECURE_LOCAL_ORIGIN === "true") return url;
  return null;
}

/**
 * Secure flag from trusted deployment configuration only, never from
 * client-controllable request headers:
 * - trusted https origin           -> Secure
 * - trusted http loopback origin   -> not Secure (local development only)
 * - no usable origin configured    -> Secure in production (fail closed);
 *                                     loopback Host allowed in development
 */
function secureCookieFor(req: NextRequest): boolean {
  const configured = trustedAppOrigin();
  if (configured) return configured.protocol === "https:";
  if (isProduction()) return true;
  const host = req.headers.get("host") ?? "";
  return !isLoopbackHost(host.replace(/:\d+$/, ""));
}

export function setSessionCookie(req: NextRequest, res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookieFor(req),
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds(),
  });
}

export function clearSessionCookie(req: NextRequest, res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: secureCookieFor(req),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function readSessionCookie(req: NextRequest): string | undefined {
  return req.cookies.get(SESSION_COOKIE)?.value;
}

/**
 * Cross-origin mutation protection. State-changing route handlers only
 * proceed when the request Origin is present, well-formed and matches the
 * trusted application origin. With no trusted origin configured, production
 * rejects every mutation (fail closed); development allows Origin-less
 * requests (curl and similar non-browser tools) and otherwise requires the
 * Origin to match the request's own scheme and Host header.
 * X-Forwarded-Host is never consulted. Combined with SameSite=Lax cookies
 * this blocks cross-site request forgery.
 */
export function isSameOriginRequest(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const configured = trustedAppOrigin();

  if (configured) {
    if (!origin) return false;
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      return false;
    }
    // A well-formed Origin header is a bare origin: no path, query, hash.
    if (parsed.origin !== origin && parsed.origin !== origin.replace(/\/$/, "")) {
      return false;
    }
    return parsed.origin === configured.origin;
  }

  if (isProduction()) return false;
  if (!origin) return true;
  const host = req.headers.get("host");
  if (!host) return false;
  try {
    const parsed = new URL(origin);
    return parsed.host === host && parsed.protocol === req.nextUrl.protocol;
  } catch {
    return false;
  }
}
