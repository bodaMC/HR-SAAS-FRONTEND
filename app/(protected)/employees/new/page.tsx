import { redirect } from "next/navigation";
import { fetchDepartments, fetchEmployees, fetchJobTitles } from "@/lib/server/api";
import { requireSession } from "@/lib/server/guard";
import {
  validCollection,
  validDepartmentRecord,
  validEmployeeRecord,
  validJobTitleRecord,
} from "@/lib/server/records";
import { getI18n } from "@/lib/i18n/server";
import { ClearSession } from "@/components/clear-session";
import { Alert } from "@/components/ui/alert";
import { EmployeeForm } from "@/components/org/employee-form";
import type { ApiDepartment, ApiEmployee, ApiJobTitle } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewEmployeePage() {
  const session = await requireSession();
  const { t } = await getI18n();
  if (!session.ok) {
    if (session.reason === "no-token") redirect("/login");
    if (session.reason === "expired") return <ClearSession notice="expired" />;
    if (session.reason === "inactive") return <ClearSession notice="inactive" />;
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-6">
        <div className="w-full max-w-md">
          <Alert message={t("dashboard.serviceUnavailable")} />
        </div>
      </main>
    );
  }

  const canManage = session.user.role === "owner" || session.user.role === "admin";
  if (!canManage) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <Alert message={t("employeeForm.forbidden")} />
      </div>
    );
  }

  const [departments, jobTitles, employees] = await Promise.all([
    fetchDepartments(session.token),
    fetchJobTitles(session.token),
    fetchEmployees(session.token),
  ]);
  const deps = validCollection<ApiDepartment>(departments, validDepartmentRecord);
  const jobs = validCollection<ApiJobTitle>(jobTitles, validJobTitleRecord);
  const emps = validCollection<ApiEmployee>(employees, validEmployeeRecord);
  if (deps === null || jobs === null || emps === null) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <Alert message={t("employeeForm.unavailable")} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0">
      <EmployeeForm
        mode="create"
        departments={deps}
        jobTitles={jobs}
        managers={emps.map((e) => ({
          id: e.id,
          label: `${e.first_name} ${e.last_name}`.trim(),
          manager_id: e.manager_id,
        }))}
      />
    </div>
  );
}
