"use client";

/**
 * Language switcher. Writes the locale preference cookie (validated
 * server-side against the ar/en allowlist) and refreshes the server tree,
 * so the next render arrives with the correct lang/dir from the server:
 * no flash and no hydration mismatch. The cookie is a UI preference only;
 * it never touches the session or permissions.
 */
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/client";

export function LanguageSwitcher() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const next: Locale = locale === "ar" ? "en" : "ar";

  function switchLocale() {
    if (next === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={switchLocale}
      data-testid="language-switcher"
      aria-label={t("language.switchLabel")}
      title={t("language.switchLabel")}
      className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-surface px-3 text-sm font-semibold text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
    >
      <Languages className="h-4 w-4" aria-hidden="true" />
      <span className="hidden min-[420px]:inline">
        {next === "ar" ? t("language.arabic") : t("language.english")}
      </span>
    </button>
  );
}
