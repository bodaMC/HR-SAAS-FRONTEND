import { forwardRef, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, id, className = "", ...rest },
  ref,
) {
  const inputId = id ?? rest.name ?? label;
  const errorId = `${inputId}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`h-11 rounded-lg border bg-surface px-3.5 text-sm text-foreground placeholder:text-foreground-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-accent disabled:cursor-not-allowed disabled:opacity-60 ${
          error ? "border-danger" : "border-border"
        } ${className}`}
        {...rest}
      />
      {error && (
        <p id={errorId} className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
