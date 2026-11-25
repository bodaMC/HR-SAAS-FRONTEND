import "server-only";
/**
 * Maps Laravel default validation messages to stable app-owned codes so raw
 * backend text never reaches the browser (spec: field-level errors without
 * raw backend text). Backend message TEXT is matched case-insensitively
 * against the known Laravel default patterns; anything unrecognized -
 * including internal exception text - collapses to the generic "invalid"
 * code. Field names are taken from the errors object's own keys, restricted
 * to the request's known field set by callers.
 */

const CODE_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  // National ID (Phase 3.1): backend messages in English or Arabic.
  [/already registered to another employee\.?$/i, "national_id_duplicate"],
  [/الرقم القومي مسجل بالفعل لموظف آخر/, "national_id_duplicate"],
  [/national id must be exactly 14 digits\.?$/i, "national_id_format"],
  [/يجب أن يتكون الرقم القومي من 14 رقم/, "national_id_format"],
  [/field is required\.?$/i, "required"],
  [/has already been taken\.?$/i, "taken"],
  [/must not be greater than/i, "max"],
  [/must be a valid email address\.?$/i, "email"],
  [/must be a valid date\.?$/i, "date"],
  [/must be a date before/i, "date"],
  [/must be a date after or equal to/i, "date"],
  [/must be true or false\.?$/i, "invalid"],
  [/must be an integer\.?$/i, "invalid"],
  [/selected .+ is invalid\.?$/i, "invalid"],
];

function toCode(message: string): string {
  for (const [pattern, code] of CODE_PATTERNS) {
    if (pattern.test(message)) return code;
  }
  return "invalid";
}

export interface SanitizedValidation {
  message: "validation";
  errors: Record<string, string[]>;
}

/**
 * Returns a sanitized 422 body for the allowed field set, or null when the
 * payload is not a recognizable Laravel validation error body.
 */
export function sanitize422(data: unknown, allowedFields: readonly string[]): SanitizedValidation | null {
  if (typeof data !== "object" || data === null) return null;
  const errors = (data as { errors?: unknown }).errors;
  if (typeof errors !== "object" || errors === null || Array.isArray(errors)) return null;
  const out: Record<string, string[]> = {};
  for (const field of allowedFields) {
    const messages = (errors as Record<string, unknown>)[field];
    if (!Array.isArray(messages)) continue;
    const codes = [...new Set(messages.filter((m): m is string => typeof m === "string").map(toCode))];
    if (codes.length > 0) out[field] = codes;
  }
  return { message: "validation", errors: out };
}
