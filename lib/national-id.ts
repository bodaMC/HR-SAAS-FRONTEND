/**
 * National ID helpers (client + server safe).
 *
 * normalizeNationalId mirrors the backend App\Support\NationalId: Arabic-Indic
 * and Extended Arabic-Indic digits become Western digits, whitespace/hyphens
 * are removed, empty becomes "". The backend is authoritative; this only
 * gives immediate feedback and keeps what is sent canonical.
 *
 * The format below is the CURRENT DEFAULT POLICY (Egypt: exactly 14 digits).
 * It is isolated in one constant so another tenant policy can replace it
 * without touching the form; national ID itself stays optional.
 */
const AR_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

export const DEFAULT_NATIONAL_ID_FORMAT = /^[0-9]{14}$/;

export function normalizeNationalId(value: string): string {
  return value
    .replace(/[٠-٩۰-۹]/g, (c) => AR_DIGITS[c] ?? c)
    .replace(/[\s\u00A0\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF-]+/g, "");
}

export function nationalIdFormatOk(normalized: string): boolean {
  return normalized === "" || DEFAULT_NATIONAL_ID_FORMAT.test(normalized);
}
