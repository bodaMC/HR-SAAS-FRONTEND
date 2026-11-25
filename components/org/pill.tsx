/** Employment-status / boolean pill with verified enum tones. */
export function StatusPill({ status, label }: { status: string; label: string }) {
  const tone =
    status === "active"
      ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
      : status === "on_leave"
        ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
        : status === "suspended"
          ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
          : status === "terminated"
            ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
            : "bg-surface-muted text-foreground-muted";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${tone}`}>
      {label}
    </span>
  );
}
