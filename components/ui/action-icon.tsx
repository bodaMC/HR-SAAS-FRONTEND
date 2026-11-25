/**
 * Consistent row/record actions (Phase 3 visual review): View, Edit and
 * Delete rendered as Lucide icon controls with accessible labels. The
 * label is always the full localized action name (aria-label + tooltip);
 * destructive actions use the danger tone and every caller keeps its
 * existing confirmation dialog - the icon button only opens it.
 */
import Link from "next/link";
import { Eye, Pencil, Trash2, type LucideIcon } from "lucide-react";

const ICONS: Record<"view" | "edit" | "delete", LucideIcon> = {
  view: Eye,
  edit: Pencil,
  delete: Trash2,
};

type Kind = keyof typeof ICONS;

const base =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-accent";

function tone(kind: Kind): string {
  return kind === "delete"
    ? `${base} text-danger hover:bg-danger-surface`
    : `${base} text-brand-strong hover:bg-surface-muted`;
}

export function ActionIconLink({
  kind,
  href,
  label,
  testId,
}: {
  kind: Exclude<Kind, "delete">;
  href: string;
  label: string;
  testId?: string;
}) {
  const Icon = ICONS[kind];
  return (
    <Link href={href} aria-label={label} title={label} data-testid={testId} className={tone(kind)}>
      <Icon className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

export function ActionIconButton({
  kind,
  label,
  onClick,
  testId,
}: {
  kind: Kind;
  label: string;
  onClick: () => void;
  testId?: string;
}) {
  const Icon = ICONS[kind];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-testid={testId}
      className={tone(kind)}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
