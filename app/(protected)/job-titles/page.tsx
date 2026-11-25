import { redirect } from "next/navigation";
import { can } from "@/lib/access";
import { RestrictedPage } from "@/components/restricted-page";
import { fetchJobTitles } from "@/lib/server/api";
import { requireSession } from "@/lib/server/guard";
import { validCollection, validJobTitleRecord } from "@/lib/server/records";
import { getI18n } from "@/lib/i18n/server";
import { ClearSession } from "@/components/clear-session";
import { Alert } from "@/components/ui/alert";
import { EntityManager } from "@/components/org/entity-manager";
import type { ApiJobTitle } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function JobTitlesPage() {
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

  if (!can(session.caps, "job_titles.view")) {
    return <RestrictedPage title={t("access.restricted.title")} body={t("access.restricted.body")} />;
  }
  const canCreate = can(session.caps, "job_titles.create");
  const canUpdate = can(session.caps, "job_titles.update");
  const canDelete = can(session.caps, "job_titles.delete");
  const items = validCollection<ApiJobTitle>(
    await fetchJobTitles(session.token),
    validJobTitleRecord,
  );

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0">
      {items === null ? (
        <>
          <h1 className="text-xl font-bold text-foreground">{t("jobTitles.title")}</h1>
          <p data-testid="entity-unavailable" className="mt-4 text-sm text-foreground-muted">
            {t("jobTitles.unavailable")}
          </p>
        </>
      ) : (
        <EntityManager section="jobTitles" apiPath="/api/job-titles" items={items} canCreate={canCreate} canUpdate={canUpdate} canDelete={canDelete} />
      )}
    </div>
  );
}
