import "server-only";
/**
 * Server-only Laravel API client.
 *
 * This module must only run on the server (route handlers, server
 * components). The base URL is a server-only environment variable, never
 * exposed to the browser, and bearer tokens are never returned to clients.
 */
import type { LoginSuccess, MeResponse } from "@/lib/types";

function baseUrl(): string {
  const base = process.env.ORBIT_API_BASE_URL;
  if (!base) {
    throw new Error("ORBIT_API_BASE_URL is not configured on the server.");
  }
  return base.replace(/\/+$/, "");
}

export type ApiResult<T> =
  | { ok: true; status: number; data: T; retryAfter: string | null }
  | { ok: false; status: number | null; data: unknown; retryAfter: string | null };

async function request<T>(
  path: string,
  init: RequestInit,
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false as const, status: null, data: null, retryAfter: null };
  }
  const retryAfter = res.headers.get("retry-after");
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (res.ok) {
    return { ok: true as const, status: res.status, data: data as T, retryAfter };
  }
  return { ok: false as const, status: res.status, data, retryAfter };
}

export function loginWithPassword(
  email: string,
  password: string,
): Promise<ApiResult<LoginSuccess>> {
  return request<LoginSuccess>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password, device_name: "orbit-web" }),
  });
}

export function fetchMe(token: string): Promise<ApiResult<MeResponse>> {
  return request<MeResponse>("/auth/me", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
}

export function logoutRemote(
  token: string,
): Promise<ApiResult<{ message: string }>> {
  return request<{ message: string }>("/auth/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
}
