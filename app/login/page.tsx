import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fetchMe } from "@/lib/server/api";
import { SESSION_COOKIE } from "@/lib/server/session";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ClearSession } from "@/components/clear-session";
import { LoginForm } from "./login-form";
import { getI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[] | undefined }>;
}) {
  const { t } = await getI18n();
  const params = await searchParams;
  const notice = typeof params.notice === "string" ? params.notice : null;

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) {
    let me = null;
    try {
      me = await fetchMe(token);
    } catch {
      me = null;
    }
    if (me?.ok && me.data?.user && me.data.user.is_active !== false) redirect("/");
    // Clear the stale cookie before showing the form, with a distinct notice
    // per failure type. ClearSession always clears locally, so no redirect
    // loop even when the backend cannot confirm revocation.
    const mapped =
      notice ??
      (me?.status === 403 || (me?.ok && me.data?.user?.is_active === false)
        ? "inactive"
        : me?.status === 401
          ? "expired"
          : "unavailable");
    return <ClearSession notice={mapped} />;
  }

  return (
    <main className="flex min-h-dvh bg-background">
      {/* Brand panel: product name, company identity and logo only.
          No slogan or service description is rendered. */}
      <aside className="relative hidden w-1/2 overflow-hidden bg-forest lg:flex lg:flex-col lg:justify-between lg:p-12">
        {/* Triangular lattice overlay, inspired by the MISRCONSULT identity */}
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="xMidYMid slice"
          viewBox="0 0 600 800"
        >
          <defs>
            <pattern
              id="lattice"
              width="86"
              height="74"
              patternUnits="userSpaceOnUse"
              patternTransform="translate(0 0)"
            >
              <path
                d="M0 74 43 0l43 74M0 74h86"
                fill="none"
                stroke="rgba(124,212,36,0.10)"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="600" height="800" fill="url(#lattice)" />
          <polygon points="600,0 600,430 240,0" fill="rgba(94,183,38,0.14)" />
          <polygon points="600,470 600,800 250,800" fill="rgba(20,96,16,0.35)" />
          <polygon
            points="600,470 600,800 250,800"
            fill="none"
            stroke="rgba(124,212,36,0.25)"
            strokeWidth="1.5"
          />
        </svg>

        <div className="relative">
          {/* The logo keeps its original colors; a light chip preserves
              contrast against the dark forest panel. */}
          <div className="inline-flex rounded-xl bg-white p-3 shadow-lg shadow-black/20">
            <BrandLogo alt={t("brand.logoAlt")} className="h-14 w-auto" />
          </div>
        </div>

        <div className="relative flex flex-col gap-3">
          <h1 className="text-4xl font-extrabold tracking-tight text-white">
            {t("brand.companyName")}
          </h1>
          <p className="text-lg font-semibold tracking-wide text-brand-accent">
            {t("brand.productName")}
          </p>
        </div>

        <p className="relative text-xs text-white/60">{t("brand.footerLine")}</p>
      </aside>

      {/* Form panel */}
      <section className="relative flex flex-1 flex-col px-6 py-8 sm:px-12">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold tracking-tight text-foreground sm:text-lg">
              {t("brand.companyName")}
            </p>
            <p className="truncate text-xs font-medium text-foreground-muted">
              {t("brand.productName")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <div className="mb-6 flex justify-center lg:hidden">
              <div className="rounded-xl bg-white p-2.5 shadow-md shadow-black/10">
                <BrandLogo alt={t("brand.logoAlt")} className="h-11 w-auto" />
              </div>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              {t("auth.welcomeBack")}
            </h2>
            <p className="mt-1 text-sm text-foreground-muted">{t("auth.signInSubtitle")}</p>
            <div className="mt-8">
              <LoginForm notice={notice} />
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-foreground-muted lg:hidden">
          {t("brand.footerLine")}
        </p>
      </section>
    </main>
  );
}
