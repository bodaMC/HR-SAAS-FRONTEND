/**
 * Locale-aware formatting built on Intl APIs. Numbers and dates follow the
 * active locale; relative times use Intl.RelativeTimeFormat so Arabic plural
 * rules are handled by the platform instead of hand-written strings.
 */
import type { Locale } from "./config";

function intlLocale(locale: Locale): string {
  return locale === "ar" ? "ar-EG" : "en-GB";
}

export function formatNumber(locale: Locale, value: number): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}

export function formatDate(locale: Locale, iso: string): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(time);
}

/** "just now" / "3 minutes ago" / "أمس" style relative stamps. */
export function formatRelativeTime(locale: Locale, iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  const minutes = Math.round((then - Date.now()) / 60000);
  if (Math.abs(minutes) < 1) return rtf.format(0, "minute");
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 7) return rtf.format(days, "day");
  return formatDate(locale, iso);
}
