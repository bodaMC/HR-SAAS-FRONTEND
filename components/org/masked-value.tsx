"use client";

/**
 * Masked sensitive value (Phase 3 visual review): the National ID renders
 * masked by default on the employee profile, with an explicit reveal
 * toggle. The field reaches this component only when the backend already
 * authorized and returned it (viewPersonalData policy, mergeWhen) - this
 * is visual privacy (shoulder-surfing protection), not an authorization
 * mechanism, and it never fabricates a value the backend withheld.
 */
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";

export function MaskedValue({ value, testId }: { value: string; testId?: string }) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  const label = shown ? t("profile.hideNationalId") : t("profile.revealNationalId");
  return (
    <span className="inline-flex items-center gap-2">
      <span dir="ltr" data-testid={testId} className="tabular-nums">
        {shown ? value : "•".repeat(value.length)}
      </span>
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-pressed={shown}
        aria-label={label}
        title={label}
        data-testid={testId ? `${testId}-toggle` : undefined}
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-accent"
      >
        {shown ? (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </span>
  );
}
