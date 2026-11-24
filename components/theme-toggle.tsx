"use client";

import { useEffect, useSyncExternalStore } from "react";

type ThemeChoice = "light" | "system" | "dark";

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

const OPTIONS: { value: ThemeChoice; label: string; icon: string }[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "system", label: "System", icon: "monitor" },
  { value: "dark", label: "Dark", icon: "moon" },
];

function Icon({ name }: { name: string }) {
  if (name === "sun") {
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
        <path d="M10 2a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1Zm0 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7-4a1 1 0 1 1 0 2h-1a1 1 0 1 1 0-2h1ZM4 9a1 1 0 1 1 0 2H3a1 1 0 0 1 0-2h1Zm11.95-4.536a1 1 0 0 1 0 1.414l-.707.707a1 1 0 0 1-1.414-1.414l.707-.707a1 1 0 0 1 1.414 0ZM6.172 13.414a1 1 0 0 1 0 1.414l-.707.707a1 1 0 0 1-1.414-1.414l.707-.707a1 1 0 0 1 1.414 0Zm9.192 1.414a1 1 0 0 1-1.414 0l-.707-.707a1 1 0 1 1 1.414-1.414l.707.707a1 1 0 0 1 0 1.414ZM6.172 5.172a1 1 0 0 1-1.414 0l-.707-.707a1 1 0 0 1 1.414-1.414l.707.707a1 1 0 0 1 0 1.414ZM10 15a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Z" />
      </svg>
    );
  }
  if (name === "moon") {
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
        <path d="M17.293 12.293A8 8 0 0 1 7.707 2.707a8.001 8.001 0 1 0 9.586 9.586Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path d="M3 4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3v2h1a1 1 0 1 1 0 2H7a1 1 0 1 1 0-2h1v-2H5a2 2 0 0 1-2-2V4Z" />
    </svg>
  );
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("orbit-theme-change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("orbit-theme-change", onChange);
  };
}

export function ThemeToggle() {
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
      aria-label="Theme"
      className="inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => select(option.value)}
          aria-pressed={choice === option.value}
          title={option.label}
          className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent ${
            choice === option.value
              ? "bg-brand-primary text-white"
              : "text-foreground-muted hover:bg-surface-muted"
          }`}
        >
          <Icon name={option.icon} />
          <span className="sr-only">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
