import "server-only";
/**
 * Server-side locale resolution. The initial server render reads the
 * preference cookie so the very first HTML carries the correct lang and
 * dir attributes: no client-side correction, no flash, no hydration
 * mismatch. Unrecognized values fall back to the default locale.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, dirOf, isLocale, type Locale } from "./config";
import { translate } from "./translate";
import { en, type Dictionary } from "./dictionaries/en";
import { ar } from "./dictionaries/ar";

export const getLocale = cache(async (): Promise<Locale> => {
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE)?.value;
  return isLocale(raw) ? raw : DEFAULT_LOCALE;
});

export function getDictionary(locale: Locale): Dictionary {
  return locale === "ar" ? ar : en;
}

/** Locale + dictionary + bound translator for server components. */
export async function getI18n(): Promise<{
  locale: Locale;
  dir: "ltr" | "rtl";
  dict: Dictionary;
  t: (path: string, params?: Record<string, string | number>) => string;
}> {
  const locale = await getLocale();
  const dict = getDictionary(locale);
  return {
    locale,
    dir: dirOf(locale),
    dict,
    t: (path, params) => translate(dict, path, params),
  };
}
