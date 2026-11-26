import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/lib/server/guard";
import { getI18n } from "@/lib/i18n/server";
import { ClearSession } from "@/components/clear-session";
import { Alert } from "@/components/ui/alert";
import { ChangePasswordForm } from "@/components/account/change-password-form";

export const dynamic = "force-dynamic";

/** Voluntary self-service password change (any signed-in account). */
export default async function ChangePasswordPage() {
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
  return (
    <div className="mx-auto w-full max-w-md min-w-0" data-testid="change-password-page">
      <Link href="/profile" className="text-sm font-medium text-brand-strong hover:underline">← {t("myProfile.title")}</Link>
      <h1 className="mt-3 text-xl font-bold text-foreground">{t("password.changeTitle")}</h1>
      <p className="mt-2 text-sm text-foreground-muted">{t("password.changeBody")}</p>
      <div className="mt-5 rounded-xl border border-border bg-surface p-5"><ChangePasswordForm /></div>
    </div>
  );
}
