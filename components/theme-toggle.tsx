"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";

type ThemeChoice = "light" | "system" | "dark";

// Existing storage key, kept unchanged for backward compatibility.
const STORAGE_KEY = "orbit-theme";

function applyTheme(choice: ThemeChoice) {
  const dark =
    choice === "dark" ||
    (choice === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // storage unavailable
  }
  return "system";
}

const OPTIONS: { value: ThemeChoice; labelKey: string; icon: LucideIcon }[] = [
  { value: "light", labelKey: "theme.light", icon: Sun },
  { value: "system", labelKey: "theme.system", icon: Monitor },
  { value: "dark", labelKey: "theme.dark", icon: Moon },
];

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("orbit-theme-change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("orbit-theme-change", onChange);
  };
}

export function ThemeToggle() {
  const { t } = useI18n();
  const choice = useSyncExternalStore(subscribe, readChoice, () => "system" as ThemeChoice);

  useEffect(() => {
    if (choice !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [choice]);

  function select(next: ThemeChoice) {
    try {
      if (next === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage unavailable
    }
    applyTheme(next);
    window.dispatchEvent(new Event("orbit-theme-change"));
  }

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
