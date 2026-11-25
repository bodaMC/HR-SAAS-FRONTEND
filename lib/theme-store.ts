/**
 * Client theme store (Phase 3.1, BUG-001). Theme is purely client-side: no
 * request, no router refresh. The preference lives in localStorage under the
 * existing key, with an in-memory fallback when storage is blocked or full
 * (private mode, policy), so the control still responds and shows the right
 * pressed state. One store is shared by every toggle instance; OS-theme and
 * cross-tab listeners are attached once per subscription and removed on
 * unsubscribe (no leaks).
 */
export type ThemeChoice = "light" | "system" | "dark";

export const THEME_KEY = "orbit-theme";

let memory: ThemeChoice | null = null;
const listeners = new Set<() => void>();
let media: MediaQueryList | null = null;

function systemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function readTheme(): ThemeChoice {
  if (memory) return memory;
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* storage unavailable: fall through to system */
  }
  return "system";
}

export function applyTheme(choice: ThemeChoice): void {
  const dark = choice === "dark" || (choice === "system" && systemDark());
  document.documentElement.classList.toggle("dark", dark);
}

export function setTheme(choice: ThemeChoice): void {
  memory = choice; // always wins immediately, even if storage fails
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
    memory = null; // storage accepted it: it is the source of truth again
  } catch {
    /* keep the in-memory value for this session */
  }
  applyTheme(choice);
  listeners.forEach((l) => l());
}

function onSystemChange() {
  if (readTheme() === "system") applyTheme("system");
}

function onStorage(e: StorageEvent) {
  if (e.key === THEME_KEY || e.key === null) {
    memory = null;
    applyTheme(readTheme());
    listeners.forEach((l) => l());
  }
}

export function subscribeTheme(listener: () => void): () => void {
  if (listeners.size === 0) {
    media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", onSystemChange);
    window.addEventListener("storage", onStorage);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      media?.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
      media = null;
    }
  };
}
