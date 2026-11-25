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

export async function POST(req: NextRequest) {
  return handleMutation(req, "POST", "/employees", FIELDS);
}
