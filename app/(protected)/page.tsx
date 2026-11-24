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
import { roleLabel } from "@/lib/nav";
import type {
  ApiCompany,
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

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function KpiCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-xl border border-border bg-surface p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Unavailable({ what }: { what: string }) {
  return (
    <p data-testid="kpi-unavailable" className="text-sm text-foreground-muted">
      {what} unavailable right now.
    </p>
  );
}

function PendingCard({
  title,
  total,
  scopeNote,
}: {
  title: string;
  total: number | null;
  scopeNote: string;
}) {
  return (
    <KpiCard title={title}>
      {total === null ? (
        <Unavailable what="This figure is" />
      ) : (
        <>
          <p className="text-3xl font-bold tracking-tight text-foreground" data-testid="pending-count">
            {total}
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
}: {
  title: string;
  ok: boolean;
  items: { key: number; primary: string; secondary: string; status: string; when: string }[];
  emptyText: string;
}) {
  return (
    <section className="min-w-0 rounded-xl border border-border bg-surface p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">{title}</h2>
      {!ok ? (
        <p data-testid="recent-unavailable" className="mt-3 text-sm text-foreground-muted">
          Recent activity is unavailable right now.
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
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${
                    item.status === "approved"
                      ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                      : item.status === "rejected"
                        ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                  }`}
                >
                  {item.status}
                </span>
                <span className="whitespace-nowrap text-xs text-foreground-muted">{item.when}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function employeeName(e: { first_name: string; last_name: string } | null | undefined): string {
  if (!e) return "Unknown employee";
  return `${e.first_name} ${e.last_name}`.trim() || "Unknown employee";
}

/* Runtime envelope validation: a successful status is not proof of a
 * usable body. Missing or non-array data, and totals that are not finite
 * non-negative integers, degrade the affected widget to Unavailable -
 * never a false Empty, never a crash, never an invented figure. */
function validCollectionItems<T>(r: ApiResult<{ data?: T[] }>): T[] | null {
  if (!r.ok) return null;
  const body = r.data as { data?: unknown } | null | undefined;
  return body && Array.isArray(body.data) ? (body.data as T[]) : null;
}

function validPage<T>(
  r: ApiResult<Paginated<T>>,
): { items: T[]; total: number | null } | null {
  if (!r.ok) return null;
  const body = r.data as { data?: unknown; meta?: { total?: unknown } } | null | undefined;
  if (!body || !Array.isArray(body.data)) return null;
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
  if (!session.ok) {
    if (session.reason === "no-token") redirect("/login");
    if (session.reason === "expired") return <ClearSession notice="expired" />;
    if (session.reason === "inactive") return <ClearSession notice="inactive" />;
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-6">
        <div className="w-full max-w-md">
          <Alert message="The service is unavailable right now. Please try again later." />
        </div>
      </main>
    );
  }
  const { token, user, company } = session;

  // Each read below is independently authorized by Laravel for the
  // caller's role, and each widget degrades honestly on failure.
  const [employees, departments, pendingLeaves, pendingPermissions, recentLeaves, recentPermissions] =
    await Promise.all([
      fetchEmployees(token),
      fetchDepartments(token),
      fetchLeaveRequests(token, "?status=pending"),
      fetchPermissionRequests(token, "?status=pending"),
      fetchLeaveRequests(token),
      fetchPermissionRequests(token),
    ]);

  const employeesData = validCollectionItems(employees);
  const departmentsData = validCollectionItems(departments);
  const pendingLeavesPage = validPage(pendingLeaves);
  const pendingPermissionsPage = validPage(pendingPermissions);
  const recentLeavesPage = validPage(recentLeaves);
  const recentPermissionsPage = validPage(recentPermissions);

  const employeeTotal = employeesData !== null ? employeesData.length : null;
  const activeTotal = employeesData !== null
    ? employeesData.filter((e) => e.employment_status === "active").length
    : null;
  const departmentTotal = departmentsData !== null ? departmentsData.length : null;
  const activeDepartments = departmentsData !== null
    ? departmentsData.filter((d) => d.is_active).length
    : null;

  const recentLeaveItems = (recentLeavesPage?.items ?? [])
    .slice(0, 5)
    .map((r: ApiLeaveRequest) => ({
      key: r.id,
      primary: employeeName(r.employee),
      secondary: `${r.leave_type?.name ?? "Leave"} · ${r.start_date ?? "?"} to ${r.end_date ?? "?"} (${r.deducted_leave_days} d)`,
      status: r.status,
      when: timeAgo(r.created_at),
    }));
  const recentPermissionItems = (recentPermissionsPage?.items ?? [])
    .slice(0, 5)
    .map((r: ApiPermissionRequest) => ({
      key: r.id,
      primary: employeeName(r.employee),
      secondary: `Permission · ${r.date ?? ""}`.trim(),
      status: r.status,
      when: timeAgo(r.created_at),
    }));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <WelcomeStrip user={user} company={company} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Employees">
          {employeeTotal === null ? (
            <Unavailable what="Employee data is" />
          ) : employeeTotal === 0 ? (
            <p data-testid="kpi-empty" className="text-sm text-foreground-muted">No employees yet.</p>
          ) : (
            <>
              <p className="text-3xl font-bold tracking-tight text-foreground" data-testid="employees-total">
                {employeeTotal}
              </p>
              <p className="mt-1 text-xs text-foreground-muted">
                {activeTotal} active of {employeeTotal} in your scope
              </p>
            </>
          )}
        </KpiCard>

        <KpiCard title="Departments">
          {departmentTotal === null ? (
            <Unavailable what="Department data is" />
          ) : departmentTotal === 0 ? (
            <p data-testid="kpi-empty" className="text-sm text-foreground-muted">No departments yet.</p>
          ) : (
            <>
              <p className="text-3xl font-bold tracking-tight text-foreground" data-testid="departments-total">
                {departmentTotal}
              </p>
              <p className="mt-1 text-xs text-foreground-muted">{activeDepartments} active</p>
            </>
          )}
        </KpiCard>

        <PendingCard
          title="Pending leave requests"
          total={pendingLeavesPage?.total ?? null}
          scopeNote="Returned for your role's scope"
        />
        <PendingCard
          title="Pending permission requests"
          total={pendingPermissionsPage?.total ?? null}
          scopeNote="Returned for your role's scope"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RecentList
          title="Recent leave requests"
          ok={recentLeavesPage !== null}
          items={recentLeaveItems}
          emptyText="No leave requests yet."
        />
        <RecentList
          title="Recent permission requests"
          ok={recentPermissionsPage !== null}
          items={recentPermissionItems}
          emptyText="No permission requests yet."
        />
      </div>
    </div>
  );
}

function WelcomeStrip({
  user,
  company,
}: {
  user: ApiUser | null;
  company: ApiCompany | null;
}) {
  if (!user) {
    return (
      <p data-testid="welcome-unavailable" className="text-sm text-foreground-muted">
        Your profile details are unavailable right now.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground" data-testid="welcome-name">
          Welcome back, {user.name}
        </h1>
        <p className="mt-1 text-sm text-foreground-muted">
          {company?.name ?? "Your company"} · {user.email}
        </p>
      </div>
      <span
        data-testid="role-badge"
        className="inline-flex items-center rounded-full bg-brand-primary/10 px-3 py-1 text-sm font-semibold text-brand-strong"
      >
        {roleLabel(user.role)}
      </span>
    </div>
  );
}
