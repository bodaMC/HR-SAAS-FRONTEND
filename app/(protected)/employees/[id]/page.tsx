import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { fetchEmployee, fetchEmployees } from "@/lib/server/api";
import { can } from "@/lib/access";
import { RestrictedPage } from "@/components/restricted-page";
import { requireSession } from "@/lib/server/guard";
import { validCollection, validEmployeeRecord, validSingle } from "@/lib/server/records";
import { getI18n } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/format";
import { ClearSession } from "@/components/clear-session";
import { Alert } from "@/components/ui/alert";
import { StatusPill } from "@/components/org/pill";
import { EmployeeActions } from "@/components/org/employee-actions";
import { MaskedValue } from "@/components/org/masked-value";
import type { ApiEmployee } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Employee profile. Renders only authorized data: personal-data fields
 * appear only when the backend included them for the caller
 * (viewPersonalData policy, mergeWhen) - absent fields are never
 * fabricated, and a fully-restricted record shows an explicit note.
 * Unknown enum values never render a guessed label.
 */
export default async function EmployeeProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const { t, locale } = await getI18n();
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

  const { id } = await params;
  // "Back to employees" keeps the directory filters: `from` is re-validated
  // against the same whitelist the directory uses (never an arbitrary URL).
  const fromRaw = (await searchParams).from;
  const fromQs = (() => {
    if (typeof fromRaw !== "string" || fromRaw.length > 600) return "";
    const src = new URLSearchParams(fromRaw.replace(/^\?/, ""));
    const out = new URLSearchParams();
    const num = /^\d{1,10}$/;
    const search = src.get("search");
    if (search) out.set("search", search.slice(0, 200));
    for (const k of ["department_id", "job_title_id", "manager_id"]) {
      const v = src.get(k);
      if (v && num.test(v)) out.set(k, v);
    }
    const st = src.get("employment_status");
    if (st && ["active", "on_leave", "suspended", "terminated"].includes(st)) out.set("employment_status", st);
    return out.size > 0 ? `?${out.toString()}` : "";
  })();
  if (!/^\d+$/.test(id)) notFound();

  // Self-service: the backend decides whether this caller may read this record
  // (employees.view, or their own record). A refusal renders the restricted panel.
  const rawEmployee = await fetchEmployee(session.token, id);
  if (!rawEmployee.ok && rawEmployee.status === 403) {
    return <RestrictedPage title={t("access.restricted.title")} body={t("access.restricted.body")} />;
  }
  const result = validSingle<ApiEmployee>(rawEmployee, validEmployeeRecord);
  if (result && "notFound" in result) notFound();

  const canManage = can(session.caps, "employees.update") || can(session.caps, "employees.delete");
  const reports =
    result !== null && can(session.caps, "employees.view")
      ? validCollection<ApiEmployee>(
          await fetchEmployees(session.token, `?manager_id=${id}`),
          validEmployeeRecord,
        )
      : null;

  if (result === null) {
    return (
      <div className="mx-auto w-full max-w-4xl min-w-0">
        <h1 className="text-xl font-bold text-foreground">{t("profile.title")}</h1>
        <p data-testid="profile-unavailable" className="mt-4 text-sm text-foreground-muted">
          {t("profile.unavailable")}
        </p>
      </div>
    );
  }

  const e = result.value;
  const name = `${e.first_name} ${e.last_name}`.trim();
  const statusLabel = ["active", "on_leave", "suspended", "terminated"].includes(e.employment_status)
    ? t(`employees.statuses.${e.employment_status}`)
    : t("employees.statuses.unknown");
  const date = (v: string | null | undefined) => (typeof v === "string" ? formatDate(locale, v) : "—");

  const personalFields: { label: string; value: React.ReactNode }[] = [];
  if (e.phone !== undefined) personalFields.push({ label: t("employeeForm.phone"), value: e.phone ?? "—" });
  if (e.date_of_birth !== undefined)
    personalFields.push({ label: t("employeeForm.dateOfBirth"), value: date(e.date_of_birth) });
  if (e.gender !== undefined)
    personalFields.push({
      label: t("employeeForm.gender"),
      value:
        e.gender === null
          ? "—"
          : ["male", "female", "other", "prefer_not_to_say"].includes(e.gender)
            ? t(`employeeForm.genders.${e.gender}`)
            : t("employees.statuses.unknown"),
    });
  // National ID reaches this page only when the backend authorized and
  // returned it; it renders masked by default with a manual reveal toggle
  // (visual privacy only, not an authorization mechanism).
  if (e.national_id !== undefined)
    personalFields.push({
      label: t("employeeForm.nationalId"),
      value:
        e.national_id === null ? (
          "—"
        ) : (
          <MaskedValue value={e.national_id} testId="profile-national-id" />
        ),
    });

  const details: { label: string; value: string; ltr?: boolean }[] = [
    { label: t("employeeForm.employeeNumber"), value: e.employee_number ?? "—", ltr: true },
    { label: t("employeeForm.email"), value: e.email ?? "—", ltr: true },
    { label: t("employees.colDepartment"), value: e.department?.name ?? t("employees.unassigned") },
    { label: t("employees.colJobTitle"), value: e.job_title?.name ?? t("employees.unassigned") },
    {
      label: t("profile.reportsTo"),
      value: e.manager ? `${e.manager.first_name} ${e.manager.last_name}`.trim() : t("employeeForm.noneOption"),
    },
    { label: t("employeeForm.hireDate"), value: date(e.hire_date), ltr: true },
    { label: t("employeeForm.terminationDate"), value: date(e.termination_date), ltr: true },
    {
      label: t("profile.linkedAccount"),
      value: e.user ? `${e.user.name} (${e.user.email})` : t("profile.notLinked"),
      ltr: true,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl min-w-0">
      <Link href={`/employees${fromQs}`} className="text-sm font-medium text-brand-strong hover:underline" data-testid="profile-back">
        ← {t("profile.back")}
      </Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-foreground">{name}</h1>
          <StatusPill status={e.employment_status} label={statusLabel} />
        </div>
        {canManage ? <EmployeeActions id={e.id} name={name} /> : null}
      </div>

      <section className="mt-6 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-xs font-semibold tracking-wider text-foreground-muted uppercase">
          {t("profile.details")}
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {details.map((d) => (
            <div key={d.label}>
              <dt className="text-xs text-foreground-muted">{d.label}</dt>
              <dd className="mt-1 text-sm font-medium text-foreground" dir={d.ltr ? "ltr" : undefined}>
                {d.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-xs font-semibold tracking-wider text-foreground-muted uppercase">
          {t("profile.personalData")}
        </h2>
        {personalFields.length === 0 ? (
          <p data-testid="profile-personal-restricted" className="mt-4 text-sm text-foreground-muted">
            {t("profile.personalDataRestricted")}
          </p>
        ) : (
          <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {personalFields.map((f) => (
              <div key={f.label}>
                <dt className="text-xs text-foreground-muted">{f.label}</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {can(session.caps, "employees.view") ? (
      <section className="mt-6 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-xs font-semibold tracking-wider text-foreground-muted uppercase">
          {t("profile.directReports")}
        </h2>
        {reports === null ? (
          <p className="mt-4 text-sm text-foreground-muted">{t("employees.unavailable")}</p>
        ) : reports.length === 0 ? (
          <p className="mt-4 text-sm text-foreground-muted">{t("profile.noDirectReports")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {reports.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {`${r.first_name} ${r.last_name}`.trim()}
                  </p>
                  <p className="truncate text-xs text-foreground-muted">
                    {r.job_title?.name ?? t("employees.unassigned")}
                  </p>
                </div>
                <Link
                  href={`/employees/${r.id}`}
                  className="shrink-0 text-sm font-medium text-brand-strong hover:underline"
                >
                  {t("employees.view")}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      ) : null}
    </div>
  );
}
