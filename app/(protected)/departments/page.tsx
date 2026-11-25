import { redirect } from "next/navigation";
import { fetchDepartments } from "@/lib/server/api";
import { requireSession } from "@/lib/server/guard";
import { validCollection, validDepartmentRecord } from "@/lib/server/records";
import { getI18n } from "@/lib/i18n/server";
import { ClearSession } from "@/components/clear-session";
import { Alert } from "@/components/ui/alert";
import { EntityManager } from "@/components/org/entity-manager";
import type { ApiDepartment } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DepartmentsPage() {
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
  const items = validCollection<ApiDepartment>(
    await fetchDepartments(session.token),
    validDepartmentRecord,
  );

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0">
      {items === null ? (
        <>
          <h1 className="text-xl font-bold text-foreground">{t("departments.title")}</h1>
          <p data-testid="entity-unavailable" className="mt-4 text-sm text-foreground-muted">
            {t("departments.unavailable")}
          </p>
        </>
      ) : (
        <EntityManager section="departments" apiPath="/api/departments" items={items} canManage={canManage} />
      )}
    </div>
  );
}
