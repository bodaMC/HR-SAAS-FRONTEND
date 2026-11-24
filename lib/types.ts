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

export interface MeResponse {
  user: ApiUser;
  company: ApiCompany | null;
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

export interface ApiEmployee {
  id: number;
  uuid: string;
  employee_number: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  employment_status: "active" | "on_leave" | "suspended" | "terminated" | string;
  department_id: number | null;
  job_title_id: number | null;
  manager_id: number | null;
  user_id: number | null;
  department?: ApiDepartment | null;
  job_title?: ApiJobTitle | null;
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
