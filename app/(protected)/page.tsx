import { redirect } from "next/navigation";
import {
  fetchDepartments,
  fetchEmployees,
  fetchLeaveRequests,
  fetchPermissionRequests,
  type ApiResult,
} from "@/lib/server/api";
import { requireSession } from "@/lib/server/guard";
import { ClearSession } from "@/components/clear-session";
import { Alert } from "@/components/ui/alert";
import { roleLabelKey } from "@/lib/nav";
import { can } from "@/lib/access";
import { Lock } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { formatDate, formatNumber, formatRelativeTime } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import type {
  ApiCompany,
  ApiDepartment,
  ApiEmployee,
  ApiLeaveRequest,
  ApiPermissionRequest,
  ApiUser,
  Paginated,
} from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Dashboard. KPI counts come only from complete authorized collections
 * (employees/departments are unpaginated ->get() collections) or from
 * backend-computed pagination totals (meta.total) for the role scope the
 * API returned. A failed widget degrades to an explicit unavailable state;
 * an empty authorized collection degrades to an explicit empty state.
 * Nothing is inferred and no figures are fabricated.
 */

type T = (path: string, params?: Record<string, string | number>) => string;

function KpiCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-xl border border-border bg-surface p-5">
      <h2 className="text-xs font-semibold tracking-wider text-foreground-muted uppercase">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Unavailable({ text }: { text: string }) {
  return (
    <p data-testid="kpi-unavailable" className="text-sm text-foreground-muted">
      {text}
    </p>
  );
}

function Restricted({ text }: { text: string }) {
  return (
    <p data-testid="kpi-restricted" className="flex items-center gap-2 text-sm text-foreground-muted">
      <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
      {text}
    </p>
  );
}

function PendingCard({
  title,
  total,
  scopeNote,
  unavailableText,
  locale,
}: {
  title: string;
  total: number | null;
  scopeNote: string;
  unavailableText: string;
  locale: Locale;
}) {
  return (
    <KpiCard title={title}>
      {total === null ? (
        <Unavailable text={unavailableText} />
      ) : (
        <>
          <p
            className="text-3xl font-bold tracking-tight text-foreground"
            data-testid="pending-count"
          >
            {formatNumber(locale, total)}
          </p>
          <p className="mt-1 text-xs text-foreground-muted">{scopeNote}</p>
        </>
      )}
    </KpiCard>
  );
}

function RecentList({
  title,
  ok,
  items,
  emptyText,
  unavailableText,
}: {
  title: string;
  ok: boolean;
  items: {
    key: string | number;
    primary: string;
    secondary: string;
    status: string;
    statusText: string;
    when: string;
  }[];
  emptyText: string;
  unavailableText: string;
}) {
  return (
    <section className="min-w-0 rounded-xl border border-border bg-surface p-5">
      <h2 className="text-xs font-semibold tracking-wider text-foreground-muted uppercase">
        {title}
      </h2>
      {!ok ? (
        <p data-testid="recent-unavailable" className="mt-3 text-sm text-foreground-muted">
          {unavailableText}
        </p>
      ) : items.length === 0 ? (
        <p data-testid="recent-empty" className="mt-3 text-sm text-foreground-muted">
          {emptyText}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {items.map((item) => (
            <li key={item.key} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 overflow-hidden">
                <p className="truncate text-sm font-medium text-foreground">{item.primary}</p>
                <p className="truncate text-xs text-foreground-muted">{item.secondary}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    item.status === "approved"
                      ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                      : item.status === "rejected"
                        ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                        : item.status === "pending"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                          : "bg-surface-muted text-foreground-muted"
                  }`}
                >
                  {item.statusText}
                </span>
                <span className="text-xs whitespace-nowrap text-foreground-muted">
                  {item.when}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function employeeName(
  e: { first_name: string; last_name: string } | null | undefined,
  fallback: string,
): string {
  if (!e) return fallback;
  const first = typeof e.first_name === "string" ? e.first_name : "";
  const last = typeof e.last_name === "string" ? e.last_name : "";
  return `${first} ${last}`.trim() || fallback;
}

/* Runtime envelope AND record-content validation: a successful status is
 * not proof of a usable body, and an array of objects is not proof of valid
 * records. Every record must carry the fields this app consumes, with the
 * types the verified backend contract defines (id, status enum membership,
 * parseable dates, numeric day counts, string nested names). A single
 * malformed record makes the affected widget Unavailable as a whole -
 * never a partial count, a guessed label, a false Empty, or a crash.
 * No HR rules are invented here: these are boundary/schema checks only. */
function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isId(v: unknown): boolean {
  return typeof v === "number" || typeof v === "string";
}

/* Required date fields per the verified backend contract: leave start_date,
 * end_date and permission date are 'required|date' in the store requests and
 * created_at is a framework timestamp, so absent or unparsable values reject
 * the record. */
function isDateString(v: unknown): boolean {
  return typeof v === "string" && !Number.isNaN(new Date(v).getTime());
}

/* Statuses verified in the backend enum (see lib/types.ts). Anything else
 * cannot be labelled honestly, so the record is rejected. */
const REQUEST_STATUSES: ReadonlySet<string> = new Set([
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

function validEmbeddedEmployee(v: unknown): boolean {
  return (
    v === undefined ||
    v === null ||
    (isPlainRecord(v) &&
      typeof v.first_name === "string" &&
      typeof v.last_name === "string")
  );
}

function validLeaveType(v: unknown): boolean {
  return (
    v === undefined ||
    v === null ||
    (isPlainRecord(v) && typeof v.name === "string")
  );
}

/* Employment statuses verified in the backend enum
 * (app/Enums/EmploymentStatus.php): active, on_leave, suspended, terminated.
 * An unknown string cannot be counted honestly (it would inflate the total
 * while matching no known bucket), so the record is rejected. */
const EMPLOYMENT_STATUSES: ReadonlySet<string> = new Set([
  "active",
  "on_leave",
  "suspended",
  "terminated",
]);

function validEmployeeRecord(v: unknown): boolean {
  return (
    isPlainRecord(v) &&
    isId(v.id) &&
    typeof v.employment_status === "string" &&
    EMPLOYMENT_STATUSES.has(v.employment_status)
  );
}

function validDepartmentRecord(v: unknown): boolean {
  return isPlainRecord(v) && isId(v.id) && typeof v.is_active === "boolean";
}

function validLeaveRecord(v: unknown): boolean {
  return (
    isPlainRecord(v) &&
    isId(v.id) &&
    typeof v.status === "string" &&
    REQUEST_STATUSES.has(v.status) &&
    isDateString(v.start_date) &&
    isDateString(v.end_date) &&
    typeof v.deducted_leave_days === "number" &&
    Number.isFinite(v.deducted_leave_days) &&
    v.deducted_leave_days >= 0 &&
    validEmbeddedEmployee(v.employee) &&
    validLeaveType(v.leave_type) &&
    isDateString(v.created_at)
  );
}

function validPermissionRecord(v: unknown): boolean {
  return (
    isPlainRecord(v) &&
    isId(v.id) &&
    typeof v.status === "string" &&
    REQUEST_STATUSES.has(v.status) &&
    isDateString(v.date) &&
    isDateString(v.created_at) &&
    validEmbeddedEmployee(v.employee)
  );
}

function validCollection<T>(
  r: ApiResult<{ data?: T[] }>,
  validRecord: (v: unknown) => boolean,
): T[] | null {
  if (!r.ok) return null;
  const body = r.data as { data?: unknown } | null | undefined;
  if (!body || !Array.isArray(body.data)) return null;
  if (!body.data.every(validRecord)) return null;
  return body.data as T[];
}

function validPage<T>(
  r: ApiResult<Paginated<T>>,
  validRecord: (v: unknown) => boolean,
): { items: T[]; total: number | null } | null {
  if (!r.ok) return null;
  const body = r.data as { data?: unknown; meta?: { total?: unknown } } | null | undefined;
  if (!body || !Array.isArray(body.data)) return null;
  if (!body.data.every(validRecord)) return null;
  const t = body.meta?.total;
  const total = typeof t === "number" && Number.isInteger(t) && t >= 0 ? t : null;
  return { items: body.data as T[], total };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  void searchParams;
  // Per-page validated session: this page never relies on the shared
  // layout. No private read is issued and no private content renders
  // until GET /api/v1/auth/me has confirmed the session.
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
  const { token, user, company, caps } = session;
  // Permission-aware: a restricted module's data is never requested, so it
  // cannot be fetched-then-hidden, counted or leaked into the payload.
  const canEmployees = can(caps, "employees.view");
  const canDepartments = can(caps, "departments.view");

  // Each read below is independently authorized by Laravel for the
  // caller's role, and each widget degrades honestly on failure.
  const [employees, departments, pendingLeaves, pendingPermissions, recentLeaves, recentPermissions] =
    await Promise.all([
      canEmployees ? fetchEmployees(token) : Promise.resolve(null),
      canDepartments ? fetchDepartments(token) : Promise.resolve(null),
      fetchLeaveRequests(token, "?status=pending"),
      fetchPermissionRequests(token, "?status=pending"),
      fetchLeaveRequests(token),
      fetchPermissionRequests(token),
    ]);

  const employeesData = employees && canEmployees ? validCollection<ApiEmployee>(employees, validEmployeeRecord) : null;
  const departmentsData = departments && canDepartments ? validCollection<ApiDepartment>(departments, validDepartmentRecord) : null;
  const pendingLeavesPage = validPage<ApiLeaveRequest>(pendingLeaves, validLeaveRecord);
  const pendingPermissionsPage = validPage<ApiPermissionRequest>(pendingPermissions, validPermissionRecord);
  const recentLeavesPage = validPage<ApiLeaveRequest>(recentLeaves, validLeaveRecord);
  const recentPermissionsPage = validPage<ApiPermissionRequest>(recentPermissions, validPermissionRecord);

  const employeeTotal = employeesData !== null ? employeesData.length : null;
  const activeTotal =
    employeesData !== null
      ? employeesData.filter((e) => e.employment_status === "active").length
      : null;
  const departmentTotal = departmentsData !== null ? departmentsData.length : null;
  const activeDepartments =
    departmentsData !== null ? departmentsData.filter((d) => d.is_active).length : null;

  const statusText = (status: unknown): string =>
    status === "approved" ||
    status === "rejected" ||
    status === "pending" ||
    status === "cancelled"
      ? t(`dashboard.status.${status}`)
      : t("dashboard.status.unknown");

  const recentLeaveItems = (recentLeavesPage?.items ?? []).slice(0, 5).map(
    (r: ApiLeaveRequest, index: number) => ({
      key: typeof r.id === "number" || typeof r.id === "string" ? r.id : `leave-${index}`,
      primary: employeeName(r.employee, t("dashboard.unknownEmployee")),
      secondary: `${r.leave_type?.name ?? t("dashboard.leaveFallback")} · ${
        typeof r.start_date === "string" ? formatDate(locale, r.start_date) : "?"
      } ${t("dashboard.dateTo")} ${
        typeof r.end_date === "string" ? formatDate(locale, r.end_date) : "?"
      } (${t("dashboard.leaveDays", { count: Number(r.deducted_leave_days) || 0 })})`,
      status: typeof r.status === "string" ? r.status : "unknown",
      statusText: statusText(r.status),
      when: formatRelativeTime(locale, r.created_at),
    }),
  );
  const recentPermissionItems = (recentPermissionsPage?.items ?? [])
    .slice(0, 5)
    .map((r: ApiPermissionRequest, index: number) => ({
      key: typeof r.id === "number" || typeof r.id === "string" ? r.id : `perm-${index}`,
      primary: employeeName(r.employee, t("dashboard.unknownEmployee")),
      secondary: `${t("dashboard.permissionFallback")} · ${
        typeof r.date === "string" ? formatDate(locale, r.date) : ""
      }`.trim(),
      status: typeof r.status === "string" ? r.status : "unknown",
      statusText: statusText(r.status),
      when: formatRelativeTime(locale, r.created_at),
    }));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <WelcomeStrip user={user} company={company} t={t} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title={t("dashboard.kpi.employees")}>
          {!canEmployees ? (
            <Restricted text={t("dashboard.kpi.restricted")} />
          ) : employeeTotal === null ? (
            <Unavailable text={t("dashboard.kpi.employeeDataUnavailable")} />
          ) : employeeTotal === 0 ? (
            <p data-testid="kpi-empty" className="text-sm text-foreground-muted">
              {t("dashboard.kpi.noEmployees")}
            </p>
          ) : (
            <>
              <p
                className="text-3xl font-bold tracking-tight text-foreground"
                data-testid="employees-total"
              >
                {formatNumber(locale, employeeTotal)}
              </p>
              <p className="mt-1 text-xs text-foreground-muted">
                {t("dashboard.kpi.activeOf", {
                  active: formatNumber(locale, activeTotal ?? 0),
                  total: formatNumber(locale, employeeTotal),
                })}
              </p>
            </>
          )}
        </KpiCard>

        <KpiCard title={t("dashboard.kpi.departments")}>
          {!canDepartments ? (
            <Restricted text={t("dashboard.kpi.restricted")} />
          ) : departmentTotal === null ? (
            <Unavailable text={t("dashboard.kpi.departmentDataUnavailable")} />
          ) : departmentTotal === 0 ? (
            <p data-testid="kpi-empty" className="text-sm text-foreground-muted">
              {t("dashboard.kpi.noDepartments")}
            </p>
          ) : (
            <>
              <p
                className="text-3xl font-bold tracking-tight text-foreground"
                data-testid="departments-total"
              >
                {formatNumber(locale, departmentTotal)}
              </p>
              <p className="mt-1 text-xs text-foreground-muted">
                {t("dashboard.kpi.activeCount", {
                  count: formatNumber(locale, activeDepartments ?? 0),
                })}
              </p>
            </>
          )}
        </KpiCard>

        <PendingCard
          title={t("dashboard.kpi.pendingLeave")}
          total={pendingLeavesPage?.total ?? null}
          scopeNote={t("dashboard.kpi.scopeNote")}
          unavailableText={t("dashboard.kpi.figureUnavailable")}
          locale={locale}
        />
        <PendingCard
          title={t("dashboard.kpi.pendingPermissions")}
          total={pendingPermissionsPage?.total ?? null}
          scopeNote={t("dashboard.kpi.scopeNote")}
          unavailableText={t("dashboard.kpi.figureUnavailable")}
          locale={locale}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RecentList
          title={t("dashboard.recentLeave")}
          ok={recentLeavesPage !== null}
          items={recentLeaveItems}
          emptyText={t("dashboard.noLeaveYet")}
          unavailableText={t("dashboard.recentUnavailable")}
        />
        <RecentList
          title={t("dashboard.recentPermissions")}
          ok={recentPermissionsPage !== null}
          items={recentPermissionItems}
          emptyText={t("dashboard.noPermissionsYet")}
          unavailableText={t("dashboard.recentUnavailable")}
        />
      </div>
    </div>
  );
}

function WelcomeStrip({
  user,
  company,
  t,
}: {
  user: ApiUser | null;
  company: ApiCompany | null;
  t: T;
}) {
  if (!user) {
    return (
      <p data-testid="welcome-unavailable" className="text-sm text-foreground-muted">
        {t("dashboard.profileUnavailable")}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1
          className="text-2xl font-bold tracking-tight text-foreground"
          data-testid="welcome-name"
        >
          {t("dashboard.welcomeBack", { name: user.name })}
        </h1>
        <p className="mt-1 text-sm text-foreground-muted">
          {company?.name ?? t("dashboard.companyFallback")} · {user.email}
        </p>
      </div>
      <span
        data-testid="role-badge"
        className="inline-flex items-center rounded-full bg-brand-primary/10 px-3 py-1 text-sm font-semibold text-brand-strong"
      >
        {t(`roles.${roleLabelKey(user.role)}`)}
      </span>
    </div>
  );
}
