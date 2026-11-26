import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { fetchMe } from "@/lib/server/api";
import { SESSION_COOKIE } from "@/lib/server/session";
import { getI18n } from "@/lib/i18n/server";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/components/logout-button";
import { BrandLogo } from "@/components/brand-logo";

export const dynamic = "force-dynamic";

/**
 * Forced first-login password change (new accounts and admin resets). The backend blocks every other API until
 * the password is changed; this page is the only screen such a session can use. A session that does not require
 * a change is sent on to the dashboard, and a missing or rejected session returns to sign-in.
 */
export default async function FirstLoginPage() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");
  let me;
  try {
    me = await fetchMe(token);
  } catch {
    me = null;
  }
  if (!me || !me.ok || !me.data?.user) redirect("/login");
  if (me.data.user.must_change_password !== true) redirect("/");
  const { t } = await getI18n();
  return (
    <main className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
        <BrandLogo alt={t("brand.logoAlt")} className="h-9 w-auto" />
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <section className="w-full max-w-md rounded-xl border border-border bg-surface p-6" data-testid="first-login-page">
          <h1 className="text-xl font-bold text-foreground">{t("password.firstTitle")}</h1>
          <p className="mt-2 text-sm text-foreground-muted">{t("password.firstBody")}</p>
          <p className="mt-1 text-xs text-foreground-muted" dir="ltr">{me.data.user.email}</p>
          <div className="mt-5">
            <ChangePasswordForm forced />
          </div>
          <div className="mt-5 border-t border-border pt-4">
            <LogoutButton />
          </div>
        </section>
      </div>
    </main>
  );
}
