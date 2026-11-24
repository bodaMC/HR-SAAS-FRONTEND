"use client";

/**
 * Client-side i18n context. The root layout seeds the provider with the
 * server-resolved locale and its dictionary, so client components render
 * the exact same strings the server produced (no hydration mismatch).
 */
import { createContext, useContext, type ReactNode } from "react";
import { dirOf, type Locale } from "./config";
import { translate } from "./translate";
import type { Dictionary } from "./dictionaries/en";

interface I18nContextValue {
  locale: Locale;
  dir: "ltr" | "rtl";
  dict: Dictionary;
  t: (path: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dictionary;
  children: ReactNode;
}) {
  const value: I18nContextValue = {
    locale,
    dir: dirOf(locale),
    dict,
    t: (path, params) => translate(dict, path, params),
  };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used inside the root I18nProvider.");
  }
  return ctx;
}
