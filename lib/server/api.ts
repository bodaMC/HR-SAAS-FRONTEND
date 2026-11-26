import "server-only";
/**
 * Server-only Laravel API client.
 *
 * This module must only run on the server (route handlers, server
 * components). The base URL is a server-only environment variable, never
 * exposed to the browser, and bearer tokens are never returned to clients.
 */
import type {
  ApiDepartment,
  ApiEmployee,
  ApiLeaveRequest,
  ApiPermissionRequest,
  ApiJobTitle,
  Collection,
  LoginSuccess,
  MeResponse,
  Paginated,
} from "@/lib/types";

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

export function fetchDepartments(
  token: string,
  query = "",
): Promise<ApiResult<Collection<ApiDepartment>>> {
  return request<Collection<ApiDepartment>>(`/departments${query}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
}

export function fetchJobTitles(
  token: string,
  query = "",
): Promise<ApiResult<Collection<ApiJobTitle>>> {
  return request<Collection<ApiJobTitle>>(`/job-titles${query}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
}

export function fetchDepartment(
  token: string,
  id: string,
): Promise<ApiResult<{ data: ApiDepartment }>> {
  return request<{ data: ApiDepartment }>(`/departments/${id}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
}

export function fetchJobTitle(
  token: string,
  id: string,
): Promise<ApiResult<{ data: ApiJobTitle }>> {
  return request<{ data: ApiJobTitle }>(`/job-titles/${id}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
}

export function fetchEmployee(
  token: string,
  id: string,
): Promise<ApiResult<{ data: ApiEmployee }>> {
  return request<{ data: ApiEmployee }>(`/employees/${id}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
}

/**
 * Same-origin BFF mutation helper. Only the form-request-validated fields
 * are ever serialized (callers pass the typed input objects), and the
 * session token never leaves the server.
 */
export function mutateApi<T>(
  token: string,
  method: "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  return request<T>(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function fetchEmployees(
  token: string,
  query = "",
): Promise<ApiResult<Collection<ApiEmployee>>> {
  return request<Collection<ApiEmployee>>(`/employees${query}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
}

export function fetchLeaveRequests(
  token: string,
  query = "",
): Promise<ApiResult<Paginated<ApiLeaveRequest>>> {
  return request<Paginated<ApiLeaveRequest>>(`/leave-requests${query}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
}

export function fetchPermissionRequests(
  token: string,
  query = "",
): Promise<ApiResult<Paginated<ApiPermissionRequest>>> {
  return request<Paginated<ApiPermissionRequest>>(`/permission-requests${query}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
}

/** Phase 3.2 access administration reads (permission-gated by Laravel on every call). */
export function fetchAccess<T>(token: string, path: string): Promise<ApiResult<T>> {
  return request<T>(`/access${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
}

/** Phase 3.3: login-account state of one employee (permission-gated by Laravel). */
export function fetchAccountState(token: string, employeeId: string): Promise<ApiResult<{ data: unknown }>> {
  return request<{ data: unknown }>(`/employees/${employeeId}/account`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
}

/** Phase 3.3 FINAL-V2: minimal Link picker data (id, name, email, active) for accounts this caller may link. */
export function fetchLinkCandidates(token: string, employeeId: string, q: string): Promise<ApiResult<{ data: unknown }>> {
  return request<{ data: unknown }>(`/employees/${employeeId}/account/link-candidates${q ? `?q=${encodeURIComponent(q)}` : ""}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
}

/** Phase 3.3: the signed-in user's own profile. */
export function fetchOwnProfile(token: string): Promise<ApiResult<{ data: unknown }>> {
  return request<{ data: unknown }>("/me/profile", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
}

/** Phase 3.3: multipart picture upload (the browser never talks to Laravel directly). */
export function uploadPicture(token: string, file: Blob, filename: string): Promise<ApiResult<{ data: unknown }>> {
  const form = new FormData();
  form.set("picture", file, filename);
  return request<{ data: unknown }>("/me/profile/picture", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    body: form,
  });
}

/** Phase 3.3: binary picture proxy. Returns null on any failure. */
export async function fetchPictureBytes(token: string, path: string): Promise<{ bytes: ArrayBuffer; type: string } | null> {
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "image/*" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!/^image\/(jpeg|png|webp)$/.test(type.split(";")[0].trim())) return null;
    return { bytes: await res.arrayBuffer(), type: type.split(";")[0].trim() };
  } catch {
    return null;
  }
}
