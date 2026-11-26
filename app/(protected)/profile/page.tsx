import { redirect } from "next/navigation";
import Link from "next/link";
import { fetchOwnProfile } from "@/lib/server/api";
import { requireSession } from "@/lib/server/guard";
import { getI18n } from "@/lib/i18n/server";
import { ClearSession } from "@/components/clear-session";
import { Alert } from "@/components/ui/alert";
import { ProfileEditor } from "@/components/account/profile-editor";
import type { ApiOwnProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

/** My Profile: every signed-in employee. Only the phone number and the picture are editable (backend-enforced). */
export default async function MyProfilePage() {
  const session = await requireSession();
  const { t } = await getI18n();
  if (!session.ok) {
    if (session.reason === "no-token") redirect("/login");
    if (session.reason === "expired") return <ClearSession notice="expired" />;
    if (session.reason === "inactive") return <ClearSession notice="inactive" />;
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-6">
        <div className="w-full max-w-md"><Alert message={t("dashboard.serviceUnavailable")} /></div>
      </main>
    );
  }
  const res = await fetchOwnProfile(session.token);
  const p = res.ok ? (res.data?.data as ApiOwnProfile | undefined) : undefined;
  const e = p && typeof p === "object" && p.has_employee ? p.employee : null;
  return (
    <div className="mx-auto w-full max-w-3xl min-w-0" data-testid="my-profile">
      <h1 className="text-xl font-bold text-foreground">{t("myProfile.title")}</h1>
      {!p ? (
        <p data-testid="my-profile-unavailable" className="mt-4 text-sm text-foreground-muted">{t("myProfile.unavailable")}</p>
      ) : !e ? (
        <p data-testid="my-profile-no-employee" className="mt-4 text-sm text-foreground-muted">{t("myProfile.noEmployee")}</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-foreground-muted" data-testid="my-profile-note">{t("myProfile.readOnlyNote")}</p>
          <section className="mt-6 rounded-xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-foreground" data-testid="my-profile-name">{`${e.first_name} ${e.last_name}`.trim()}</h2>
            <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                [t("myProfile.employeeNumber"), e.employee_number, true],
                [t("myProfile.workEmail"), e.work_email ?? "—", true],
                [t("myProfile.loginEmail"), p.user.email, true],
                [t("myProfile.department"), e.department ?? "—", false],
                [t("myProfile.jobTitle"), e.job_title ?? "—", false],
                [t("myProfile.employmentType"), e.employment_type ? t(`employeeForm.employmentTypes.${e.employment_type}`) : t("employeeForm.employmentTypes.none"), false],
                [t("myProfile.hireDate"), e.hire_date ? e.hire_date : "—", true],
                [t("myProfile.trainee"), e.is_trainee ? t("profile.yes") : t("profile.no"), false],
                [t("myProfile.status"), ["active", "on_leave", "suspended", "terminated"].includes(e.employment_status) ? t(`employees.statuses.${e.employment_status}`) : t("employees.statuses.unknown"), false],
              ].map(([label, value, ltr]) => (
                <div key={String(label)}>
                  <dt className="text-xs text-foreground-muted">{label}</dt>
                  <dd className="mt-1 text-sm font-medium text-foreground" dir={ltr ? "ltr" : undefined}>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <div className="mt-6">
            <ProfileEditor name={`${e.first_name} ${e.last_name}`.trim()} phone={e.phone ?? ""} hasPicture={e.has_picture} pictureVersion={e.picture_version} />
          </div>
        </>
      )}
      <p className="mt-6">
        <Link href="/profile/password" className="text-sm font-medium text-brand-strong hover:underline" data-testid="profile-change-password-link">{t("myProfile.changePassword")}</Link>
      </p>
    </div>
  );
}
