"use client";

/**
 * Language switcher (Phase 3.1, BUG-001).
 *
 * Root cause of the "stops responding" report: the old handler computed the
 * target from the RENDERED locale, so a second click before the server
 * refresh finished re-wrote the same cookie (clicks collapsed), and there was
 * no pending feedback, so the control looked frozen.
 *
 * Now: every click flips the LATEST requested locale (kept in a ref), the
 * cookie is written immediately so it always holds the latest selection, one
 * refresh is queued inside a transition (visible pending state, no full
 * reload), and when the refresh settles on a locale that is not the latest
 * request it refreshes again. Unsaved client state (forms) survives because
 * router.refresh() keeps client components mounted. The cookie is a UI
 * preference only; it never touches the session or permissions.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages, Loader2 } from "lucide-react";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/client";

export function LanguageSwitcher() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const desired = useRef<Locale>(locale);
  const [requested, setRequested] = useState<Locale>(locale);

  /* After the server settles, re-sync if the latest selection differs. */
  useEffect(() => {
    if (!pending && desired.current !== locale) {
      startTransition(() => router.refresh());
    }
  }, [pending, locale, router]);

  const target: Locale = requested === "ar" ? "en" : "ar";

  function switchLocale() {
    const next: Locale = desired.current === "ar" ? "en" : "ar";
    desired.current = next;
    setRequested(next);
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <button
      type="button"
      onClick={switchLocale}
      data-testid="language-switcher"
      data-pending={pending ? "true" : "false"}
      aria-busy={pending}
      aria-label={pending ? t("language.pending") : t("language.switchLabel")}
      title={pending ? t("language.pending") : t("language.switchLabel")}
      className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-surface px-3 text-sm font-semibold text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Languages className="h-4 w-4" aria-hidden="true" />
      )}
      <span className="hidden min-[420px]:inline">
        {target === "ar" ? t("language.arabic") : t("language.english")}
      </span>
    </button>
  );
}
