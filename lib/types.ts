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
