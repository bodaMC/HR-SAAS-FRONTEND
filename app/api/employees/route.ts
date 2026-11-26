import type { NextRequest } from "next/server";
import { handleMutation } from "@/lib/server/bff";

/* Phase 3.3: user_id is not an employee field any more (linking happens only through the audited account
 * lifecycle routes) and termination_date belongs to the terminate action; neither is ever forwarded. */
const FIELDS = [
  "employee_number", "first_name", "last_name", "email", "phone",
  "date_of_birth", "gender", "national_id", "hire_date",
  "employment_status", "department_id", "job_title_id", "manager_id",
  "employment_type", "is_trainee",
] as const;

export async function POST(req: NextRequest) {
  return handleMutation(req, "POST", "/employees", FIELDS);
}
