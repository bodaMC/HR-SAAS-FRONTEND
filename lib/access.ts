/**
 * Client-safe access helpers (Phase 3.2).
 *
 * Capabilities come only from the server-verified `access` block of
 * GET /auth/me. They drive navigation and page chrome; Laravel remains the
 * authority on every endpoint call. A missing or malformed block yields NO
 * permissions (fail closed), never a guess from the legacy role.
 */
import type { ApiAccess } from "@/lib/types";

export interface AccessRole { id: number; key?: string; name: string; name_ar: string | null; is_system: boolean }

export interface Capabilities {
  permissions: readonly string[];
  roles: readonly AccessRole[];
  isPlatformAdmin: boolean;
}

export const NO_CAPABILITIES: Capabilities = { permissions: [], roles: [], isPlatformAdmin: false };

export function parseAccess(raw: unknown): Capabilities {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return NO_CAPABILITIES;
  const a = raw as Partial<ApiAccess>;
  if (!Array.isArray(a.permissions)) return NO_CAPABILITIES;
  const permissions = a.permissions.filter((p): p is string => typeof p === "string" && /^[a-z_]+\.[a-z_]+$/.test(p));
  const roles: AccessRole[] = Array.isArray(a.roles)
    ? a.roles
        .filter((r): r is NonNullable<ApiAccess["roles"]>[number] => typeof r === "object" && r !== null && typeof r.name === "string" && typeof r.id === "number")
        .map((r) => ({ id: r.id, key: typeof r.key === "string" ? r.key : undefined, name: r.name, name_ar: typeof r.name_ar === "string" ? r.name_ar : null, is_system: r.is_system === true }))
    : [];
  return { permissions, roles, isPlatformAdmin: a.is_platform_admin === true };
}

export function can(caps: Capabilities, ...anyOf: string[]): boolean {
  return anyOf.some((p) => caps.permissions.includes(p));
}
