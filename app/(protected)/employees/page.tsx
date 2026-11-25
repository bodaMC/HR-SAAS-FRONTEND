import { redirect } from "next/navigation";
import { can } from "@/lib/access";
import { RestrictedPage } from "@/components/restricted-page";
import { emptyCollection } from "@/lib/server/empty";
import Link from "next/link";
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
import { StatusPill } from "@/components/org/pill";
import { EmployeeDirectory } from "@/components/org/employee-directory";
import { ActionIconLink } from "@/components/ui/action-icon";
import type { ApiDepartment, ApiEmployee, ApiJobTitle } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Employee directory. Filters map 1:1 to the verified backend query
 * parameters (department_id, job_title_id, manager_id, employment_status,
 * search) - no invented filtering. Add/Edit controls render for
 * owner/admin only (policy UX mirror; the backend enforces on every call).
 */
export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const { t, locale } = await getI18n();
  void locale;
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

  if (!can(session.caps, "employees.view")) {
    return <RestrictedPage title={t("access.restricted.title")} body={t("access.restricted.body")} />;
  }
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const search = one(sp.search).slice(0, 200);
  const departmentId = /^\d+$/.test(one(sp.department_id)) ? one(sp.department_id) : "";
  const jobTitleId = /^\d+$/.test(one(sp.job_title_id)) ? one(sp.job_title_id) : "";
  const managerId = /^\d+$/.test(one(sp.manager_id)) ? one(sp.manager_id) : "";
  const status = ["active", "on_leave", "suspended", "terminated"].includes(one(sp.employment_status))
    ? one(sp.employment_status)
    : "";

  const qs = new URLSearchParams();
  if (search) qs.set("search", search);
  if (departmentId) qs.set("department_id", departmentId);
  if (jobTitleId) qs.set("job_title_id", jobTitleId);
  if (managerId) qs.set("manager_id", managerId);
  if (status) qs.set("employment_status", status);
  const query = qs.size > 0 ? `?${qs.toString()}` : "";

  const canCreate = can(session.caps, "employees.create");
  const canUpdate = can(session.caps, "employees.update");
  // The manager dropdown needs the unfiltered list; reuse the main response
  // when no filter is active instead of calling the API twice.
  const [employeesRes, departmentsRes, jobTitlesRes, allEmployeesRes] = await Promise.all([
    fetchEmployees(session.token, query),
    can(session.caps, "departments.view") ? fetchDepartments(session.token) : Promise.resolve(emptyCollection<ApiDepartment>()),
    can(session.caps, "job_titles.view") ? fetchJobTitles(session.token) : Promise.resolve(emptyCollection<ApiJobTitle>()),
    query === "" ? Promise.resolve(null) : fetchEmployees(session.token),
  ]);
  const employees = validCollection<ApiEmployee>(employeesRes, validEmployeeRecord);
  const departments = validCollection<ApiDepartment>(departmentsRes, validDepartmentRecord) ?? [];
  const jobTitles = validCollection<ApiJobTitle>(jobTitlesRes, validJobTitleRecord) ?? [];
  const allEmployees =
    validCollection<ApiEmployee>(allEmployeesRes ?? employeesRes, validEmployeeRecord) ?? [];

  const fromParam = query === "" ? "" : `?from=${encodeURIComponent(query)}`;
  const nameOf = (e: ApiEmployee) => `${e.first_name} ${e.last_name}`.trim();
  const statusLabel = (s: string) =>
    ["active", "on_leave", "suspended", "terminated"].includes(s)
      ? t(`employees.statuses.${s}`)
      : t("employees.statuses.unknown");

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-foreground">{t("employees.title")}</h1>
        {canCreate ? (
          <Link
            href="/employees/new"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-primary px-5 text-sm font-semibold text-white hover:bg-brand-secondary"
            data-testid="employee-add"
          >
            {t("employees.add")}
          </Link>
        ) : null}
      </div>

      <EmployeeDirectory
        initial={{
          search,
          department_id: departmentId,
          job_title_id: jobTitleId,
          manager_id: managerId,
          employment_status: status,
        }}
        departments={departments.map((d) => ({ id: String(d.id), name: d.name }))}
        jobTitles={jobTitles.map((j) => ({ id: String(j.id), name: j.name }))}
        managers={allEmployees.map((e) => ({ id: String(e.id), name: nameOf(e) }))}
      >
      {employees === null ? (
        <p data-testid="employees-unavailable" role="alert" className="mt-6 text-sm text-foreground-muted">
          {t("employees.loadError")}
        </p>
      ) : employees.length === 0 ? (
        <p data-testid="employees-empty" className="mt-6 text-sm text-foreground-muted">
          {t("employees.empty")}
        </p>
      ) : (
        <>
        <p data-testid="employees-count" aria-live="polite" className="mt-4 text-sm text-foreground-muted">
          {employees.length === 1
            ? t("employees.resultCountOne")
            : t("employees.resultCount", { count: employees.length })}
        </p>
        {/* Mobile + tablet record cards (below lg): same server-fetched,
            validated records and the same destinations as the desktop
            table - presentation only. */}
        <ul className="mt-4 space-y-3 lg:hidden" data-testid="employee-cards">
          {employees.map((e) => (
            <li key={e.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words font-medium text-foreground">{nameOf(e)}</p>
                  <p className="mt-1 text-sm text-foreground-muted" dir="ltr">
                    {e.employee_number ?? "—"}
                  </p>
                </div>
                <StatusPill status={e.employment_status} label={statusLabel(e.employment_status)} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="min-w-0">
                  <dt className="text-xs text-foreground-muted">{t("employees.colDepartment")}</dt>
                  <dd className="break-words text-foreground">
                    {e.department?.name ?? t("employees.unassigned")}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-foreground-muted">{t("employees.colJobTitle")}</dt>
                  <dd className="break-words text-foreground">
                    {e.job_title?.name ?? t("employees.unassigned")}
                  </dd>
                </div>
              </dl>
              <div className="mt-3 flex items-center justify-end gap-1 border-t border-border pt-3">
                <ActionIconLink kind="view" href={`/employees/${e.id}${fromParam}`} label={t("employees.view")} />
                {canUpdate ? (
                  <ActionIconLink kind="edit" href={`/employees/${e.id}/edit`} label={t("employees.edit")} />
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        {/* Desktop table (lg and up): unchanged from the approved design. */}
        <div
          className="mt-4 hidden overflow-x-auto rounded-xl border border-border bg-surface lg:block"
          role="region"
          aria-label={t("employees.title")}
          tabIndex={0}
        >
          <table className="w-full min-w-[720px] text-start text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wider text-foreground-muted">
                <th className="px-4 py-3 text-start font-semibold">{t("employees.colName")}</th>
                <th className="px-4 py-3 text-start font-semibold">{t("employees.colNumber")}</th>
                <th className="px-4 py-3 text-start font-semibold">{t("employees.colEmail")}</th>
                <th className="px-4 py-3 text-start font-semibold">{t("employees.colDepartment")}</th>
                <th className="px-4 py-3 text-start font-semibold">{t("employees.colJobTitle")}</th>
                <th className="px-4 py-3 text-start font-semibold">{t("employees.colStatus")}</th>
                <th className="px-4 py-3 text-start font-semibold">{t("employees.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{nameOf(e)}</td>
                  <td className="px-4 py-3 text-foreground-muted" dir="ltr">
                    {e.employee_number ?? "—"}
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-foreground-muted" dir="ltr">
                    {e.email ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-foreground-muted">
                    {e.department?.name ?? t("employees.unassigned")}
                  </td>
                  <td className="px-4 py-3 text-foreground-muted">
                    {e.job_title?.name ?? t("employees.unassigned")}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={e.employment_status} label={statusLabel(e.employment_status)} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <ActionIconLink kind="view" href={`/employees/${e.id}${fromParam}`} label={t("employees.view")} />
                      {canUpdate ? (
                        <ActionIconLink kind="edit" href={`/employees/${e.id}/edit`} label={t("employees.edit")} />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
      </EmployeeDirectory>
    </div>
  );
}
