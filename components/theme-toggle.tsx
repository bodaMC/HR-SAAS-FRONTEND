"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { readTheme, setTheme, subscribeTheme, type ThemeChoice } from "@/lib/theme-store";

const OPTIONS: { value: ThemeChoice; labelKey: string; icon: LucideIcon }[] = [
  { value: "light", labelKey: "theme.light", icon: Sun },
  { value: "system", labelKey: "theme.system", icon: Monitor },
  { value: "dark", labelKey: "theme.dark", icon: Moon },
];

export function ThemeToggle() {
  const { t } = useI18n();
  const choice = useSyncExternalStore(subscribeTheme, readTheme, () => "system" as ThemeChoice);
  const select = (next: ThemeChoice) => setTheme(next);

  return (
    <div
      role="group"
      aria-label={t("theme.label")}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1"
    >
      {OPTIONS.map((option) => {
        const label = t(option.labelKey);
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => select(option.value)}
            aria-pressed={choice === option.value}
            title={label}
            className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent ${
              choice === option.value
                ? "bg-brand-primary text-white"
                : "text-foreground-muted hover:bg-surface-muted"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
