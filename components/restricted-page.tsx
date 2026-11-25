import { Lock } from "lucide-react";

/**
 * Rendered by server page guards when the signed-in user lacks the
 * permission for a module. It is rendered INSTEAD of the module: no module
 * data is requested or serialized for the page.
 */
export function RestrictedPage({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto w-full max-w-xl" data-testid="page-restricted">
      <div className="rounded-xl border border-border bg-surface p-8 text-center">
        <Lock className="mx-auto h-8 w-8 text-foreground-muted" aria-hidden="true" />
        <h1 className="mt-4 text-lg font-bold text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-foreground-muted">{body}</p>
      </div>
    </div>
  );
}
