"use client";

/**
 * Shared labelled form controls for Phase 3 management forms. All labels
 * and error strings are passed in from dictionaries (no hardcoded copy).
 * Errors render as localized, app-owned strings keyed by validation code.
 */

const inputClass =
  "mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted focus:border-brand-accent focus:outline-none disabled:opacity-60";

export function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs text-danger" role="alert">
      {message}
    </p>
  );
}

export function TextField({
  id,
  label,
  value,
  onChange,
  type = "text",
  required = false,
  maxLength,
  error,
  disabled = false,
  placeholder,
  dir,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  maxLength?: number;
  error?: string | null;
  disabled?: boolean;
  placeholder?: string;
  dir?: "ltr" | "rtl" | "auto";
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        required={required}
        maxLength={maxLength}
        disabled={disabled}
        placeholder={placeholder}
        dir={dir}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
      <FieldError message={error ?? null} />
    </div>
  );
}

export function TextAreaField({
  id,
  label,
  value,
  onChange,
  maxLength,
  error,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  error?: string | null;
  disabled?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
      <FieldError message={error ?? null} />
    </div>
  );
}

export function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  required = false,
  error,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
  error?: string | null;
  disabled?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </label>
      <select
        id={id}
        value={value}
        required={required}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <FieldError message={error ?? null} />
    </div>
  );
}

export function CheckboxField({
  id,
  label,
  checked,
  onChange,
  disabled = false,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-border accent-brand-accent"
      />
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
    </div>
  );
}
