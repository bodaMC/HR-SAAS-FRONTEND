import type { NextRequest } from "next/server";
import { handleMutation } from "@/lib/server/bff";

/* Account linking (user_id) is deferred past Phase 3: the BFF never
 * forwards it, so direct requests cannot link or unlink accounts. Existing
 * links (read via EmployeeResource.user) keep displaying unchanged. */
const FIELDS = [
  "employee_number", "first_name", "last_name", "email", "phone",
  "date_of_birth", "gender", "national_id", "hire_date", "termination_date",
  "employment_status", "department_id", "job_title_id", "manager_id",
] as const;

/* Resource ids are positive integers per the API contract; anything else
 * is malformed and never reaches the backend. */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[1-9]\d*$/.test(id)) return handleMutation(req, "PUT", "/employees/__invalid__", FIELDS);
  return handleMutation(req, "PUT", `/employees/${id}`, FIELDS);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[1-9]\d*$/.test(id)) return handleMutation(req, "DELETE", "/employees/__invalid__", FIELDS);
  return handleMutation(req, "DELETE", `/employees/${id}`, FIELDS);
}
