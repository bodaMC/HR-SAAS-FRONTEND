/**
 * Locale configuration for the CONURE HR interface.
 *
 * English is the default for a new visitor. The selected locale persists in
 * a plain (non-HttpOnly) preference cookie so both the server (initial
 * render with the correct lang/dir, no flash) and the client (switcher) can
 * read it. Values are always validated against the allowlist; anything else
 * falls back to the default locale.
 *
 * This cookie is a UI preference only: it carries no session data and never
 * affects authentication or authorization.
 */

export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** New preference cookie; existing orbit_* keys stay untouched. */
export const LOCALE_COOKIE = "conure_locale";

const DIRECTIONS: Record<Locale, "ltr" | "rtl"> = {
  en: "ltr",
  ar: "rtl",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function dirOf(locale: Locale): "ltr" | "rtl" {
  return DIRECTIONS[locale];
}
