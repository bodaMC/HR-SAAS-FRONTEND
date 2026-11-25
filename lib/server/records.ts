import "server-only";
/**
 * Runtime boundary validation for Phase 3 API payloads (departments,
 * job titles, employees). A successful status is not proof of a usable
 * body: every record must carry the fields this app consumes with the
 * types the verified backend contract defines. A single malformed record
 * rejects the whole collection (never a partial render, a guessed value,
 * or a crash). These are schema checks only - no HR rules are invented.
 */
import type { ApiResult } from "@/lib/server/api";

export const EMPLOYMENT_STATUSES: ReadonlySet<string> = new Set([
  "active",
  "on_leave",
  "suspended",
  "terminated",
]);

export const GENDERS: ReadonlySet<string> = new Set([
  "male",
  "female",
  "other",
  "prefer_not_to_say",
]);

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/* Resource ids are positive integers per the API contract; strings,
 * zero, negatives and non-integers are malformed and fail closed. */
function isId(v: unknown): boolean {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

function isNullableString(v: unknown): boolean {
  return v === null || typeof v === "string";
}

function isNullableId(v: unknown): boolean {
  return v === null || isId(v);
}

/* Dates are 'Y-m-d' strings or null per the resource contract. */
function isNullableDate(v: unknown): boolean {
  if (v === null) return true;
  return typeof v === "string" && !Number.isNaN(new Date(v).getTime());
}

export function validDepartmentRecord(v: unknown): boolean {
  return (
    isPlainRecord(v) &&
    isId(v.id) &&
    typeof v.name === "string" &&
    isNullableString(v.description) &&
    typeof v.is_active === "boolean"
  );
}

export function validJobTitleRecord(v: unknown): boolean {
  return validDepartmentRecord(v);
}

function validEmbeddedDepartment(v: unknown): boolean {
  return v === null || v === undefined || validDepartmentRecord(v);
}

function validManagerRef(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  return (
    isPlainRecord(v) &&
    isId(v.id) &&
    typeof v.first_name === "string" &&
    typeof v.last_name === "string"
  );
}

function validUserRef(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  return (
    isPlainRecord(v) &&
    isId(v.id) &&
    typeof v.name === "string" &&
    typeof v.email === "string"
  );
}

export function validEmployeeRecord(v: unknown): boolean {
  if (!isPlainRecord(v)) return false;
  if (!isId(v.id)) return false;
  /* Per EmployeeResource: employee_number/email are always present strings;
   * hire_date/termination_date are always present (string|null). Anything
   * else fails closed - these fields are consumed by the UI. */
  if (typeof v.employee_number !== "string") return false;
  if (typeof v.first_name !== "string" || typeof v.last_name !== "string") return false;
  if (typeof v.email !== "string") return false;
  if (typeof v.employment_status !== "string" || !EMPLOYMENT_STATUSES.has(v.employment_status)) {
    return false;
  }
  if (!isNullableId(v.department_id) || !isNullableId(v.job_title_id)) return false;
  if (!isNullableId(v.manager_id) || !isNullableId(v.user_id)) return false;
  if (!("hire_date" in v) || !isNullableDate(v.hire_date)) return false;
  if (!("termination_date" in v) || !isNullableDate(v.termination_date)) return false;
  /* Personal data is conditionally present (viewPersonalData policy). When
   * present it must be well-typed; absence is normal for unauthorized
   * callers, never an error and never fabricated. */
  if (v.phone !== undefined && !isNullableString(v.phone)) return false;
  if (v.date_of_birth !== undefined && !isNullableDate(v.date_of_birth)) return false;
  if (v.gender !== undefined && !(v.gender === null || (typeof v.gender === "string" && GENDERS.has(v.gender)))) {
    return false;
  }
  if (v.national_id !== undefined && !isNullableString(v.national_id)) return false;
  if (!validEmbeddedDepartment(v.department) || !validEmbeddedDepartment(v.job_title)) return false;
  if (!validManagerRef(v.manager) || !validUserRef(v.user)) return false;
  return true;
}

export function validCollection<T>(
  r: ApiResult<{ data?: T[] }>,
  validRecord: (v: unknown) => boolean,
): T[] | null {
  if (!r.ok) return null;
  const body = r.data as { data?: unknown } | null | undefined;
  if (!body || !Array.isArray(body.data)) return null;
  if (!body.data.every(validRecord)) return null;
  return body.data as T[];
}

export function validSingle<T>(
  r: ApiResult<{ data?: T }>,
  validRecord: (v: unknown) => boolean,
): { value: T } | { notFound: true } | null {
  if (r.status === 404) return { notFound: true };
  if (!r.ok) return null;
  const body = r.data as { data?: unknown } | null | undefined;
  if (!body || !validRecord(body.data)) return null;
  return { value: body.data as T };
}
