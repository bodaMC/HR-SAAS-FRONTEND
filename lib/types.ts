/** API contracts verified against HR-SAAS branch fix/super-admin-security. */

export interface ApiCompany {
  id: number;
  uuid: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface ApiUser {
  id: number;
  uuid: string;
  name: string;
  email: string;
  phone: string | null;
  role: "owner" | "admin" | "manager" | "employee" | string;
  is_active: boolean;
  email_verified_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  company?: ApiCompany | null;
}

export interface LoginSuccess {
  message: string;
  token: string;
  token_type: string;
  user: ApiUser;
  company: ApiCompany | null;
}

/** Server-verified capabilities from GET /auth/me (Phase 3.2). Recomputed by Laravel on every request. */
export interface ApiAccess {
  permissions: string[];
  roles: { id: number; key: string; name: string; name_ar?: string | null; is_system: boolean }[];
  is_platform_admin: boolean;
}

export interface MeResponse {
  user: ApiUser;
  company: ApiCompany | null;
  access?: ApiAccess;
}

/** Laravel validation error shape (HTTP 422). */
export interface ValidationErrorBody {
  message: string;
  errors?: Record<string, string[]>;
}

/** Phase 2: dashboard entity contracts (verified against backend resources). */

export interface ApiDepartment {
  id: number;
  uuid: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface ApiJobTitle {
  id: number;
  uuid: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

/** Embedded manager shape (verified in EmployeeResource). */
export interface ApiManagerRef {
  id: number;
  uuid: string;
  employee_number: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
}

/** Embedded linked-user shape (verified in EmployeeResource). */
export interface ApiUserRef {
  id: number;
  uuid: string;
  name: string;
  email: string;
}

export interface ApiEmployee {
  id: number;
  uuid: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  email: string;
  hire_date: string | null;
  termination_date: string | null;
  employment_status: "active" | "on_leave" | "suspended" | "terminated" | string;
  department_id: number | null;
  job_title_id: number | null;
  manager_id: number | null;
  user_id: number | null;
  department?: ApiDepartment | null;
  job_title?: ApiJobTitle | null;
  manager?: ApiManagerRef | null;
  user?: ApiUserRef | null;
  /* Personal data is conditionally PRESENT per record, gated server-side by
   * the viewPersonalData policy (mergeWhen in EmployeeResource). Absence
   * means "not permitted for the caller", never "no value". */
  phone?: string | null;
  date_of_birth?: string | null;
  gender?: "male" | "female" | "other" | "prefer_not_to_say" | string | null;
  national_id?: string | null;
}

/* Phase 3 mutation payloads (fields verified in the form requests; anything
 * else - team_leader_id, is_disabled, insurance_years, is_hod,
 * is_team_leader, is_project_engineer, is_ceo, company_id - is not writable
 * through the API and is never sent). */
export interface DepartmentInput {
  name: string;
  description?: string | null;
  is_active?: boolean | null;
}

export interface JobTitleInput {
  name: string;
  description?: string | null;
  is_active?: boolean | null;
}

export interface EmployeeInput {
  employee_number: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  national_id?: string | null;
  hire_date?: string | null;
  termination_date?: string | null;
  employment_status?: string | null;
  department_id?: number | null;
  job_title_id?: number | null;
  manager_id?: number | null;
  user_id?: number | null;
}

export interface ApiLeaveType {
  id: number;
  uuid: string;
  name: string;
}

export interface ApiLeaveRequest {
  id: number;
  uuid: string;
  employee?: { id: number; first_name: string; last_name: string } | null;
  leave_type?: ApiLeaveType | null;
  start_date: string | null;
  end_date: string | null;
  deducted_leave_days: number;
  status: "pending" | "approved" | "rejected" | "cancelled" | string;
  created_at?: string | null;
}

export interface ApiPermissionRequest {
  id: number;
  uuid: string;
  employee?: { id: number; first_name: string; last_name: string } | null;
  date?: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled" | string;
  created_at?: string | null;
}

/** Laravel default pagination envelope for ->paginate() collections. */
export interface Paginated<T> {
  data: T[];
  meta?: { total?: number; current_page?: number; last_page?: number };
}

/** Laravel default envelope for unpaginated resource collections. */
export interface Collection<T> {
  data: T[];
}

/** Phase 3.2 access administration contracts (verified against the Laravel resources). */
export interface ApiRole {
  id: number;
  uuid: string;
  key: string;
  name: string;
  name_ar: string | null;
  description: string | null;
  is_system: boolean;
  is_protected: boolean;
  permissions: string[];
  users_count: number;
}

export interface ApiPermissionGroup {
  key: string;
  permissions: { code: string; grantable_by_you: boolean }[];
}

export interface ApiPermissionRegistry {
  groups: ApiPermissionGroup[];
  protected: string[];
  reserved: string[];
  your_permissions: string[];
}

export interface AccessUsersMeta {
  total: number;
  per_page: number;
  current_page: number;
  last_page: number;
}

export interface ApiAccessUser {
  id: number;
  name: string;
  email: string;
  is_active: boolean;
  legacy_role: string | null;
  roles: { id: number; key: string; name: string; name_ar?: string | null; is_system: boolean }[];
  effective_permissions?: string[];
}
