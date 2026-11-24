import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fetchMe } from "@/lib/server/api";
import { SESSION_COOKIE } from "@/lib/server/session";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { ClearSession } from "@/components/clear-session";
import { LogoutButton } from "@/components/logout-button";
import { Alert } from "@/components/ui/alert";
import { brand } from "@/lib/brand";
import type { ApiUser } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  employee: "Employee",
};

function roleLabel(user: ApiUser): string {
  return ROLE_LABELS[user.role] ?? user.role;
}

export default async function WorkspacePage() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");

  let me;
  try {
    me = await fetchMe(token);
  } catch {
    me = { ok: false as const, status: null, data: null, retryAfter: null };
  }

  if (me.status === 401) {
    // Invalid, expired or revoked token: clear the cookie and return to login.
    return <ClearSession notice="expired" />;
  }
  if (me.status === 403) {
    return <ClearSession notice="inactive" />;
  }
  if (!me.ok || !me.data?.user) {
    // Backend unreachable or 5xx: show a safe message, do not redirect-loop.
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-6">
        <div className="w-full max-w-md">
          <Alert message="The service is unavailable right now. Please try again later." />
        </div>
      </main>
    );
  }

  const { user, company } = me.data;
  if (user.is_active === false || company?.is_active === false) {
    return <ClearSession notice="inactive" />;
  }

  return (
    <main className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <span className="text-lg font-extrabold tracking-tight text-foreground">
            ORBIT<span className="text-brand-strong"> HR</span>
          </span>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
        <div className="flex items-center gap-4">
          <div className="rounded-xl border border-border bg-white p-2 dark:bg-white">
            <BrandLogo className="h-9 w-auto" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Welcome, {user.name}
            </h1>
            <p className="text-sm text-foreground-muted">{brand.footerLine}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
              Name
            </h2>
            <p className="mt-2 text-base font-semibold text-foreground">{user.name}</p>
            <p className="mt-1 text-sm text-foreground-muted">{user.email}</p>
          </section>

          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
              Company
            </h2>
            <p className="mt-2 text-base font-semibold text-foreground">
              {company?.name ?? user.company?.name ?? "—"}
            </p>
          </section>

          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
              System role
            </h2>
            <p className="mt-2">
              <span className="inline-flex items-center rounded-full bg-brand-primary/10 px-3 py-1 text-sm font-semibold text-brand-strong">
                {roleLabel(user)}
              </span>
            </p>
          </section>
        </div>
      </div>

      <footer className="border-t border-border py-4">
        <p className="text-center text-xs text-foreground-muted">{brand.footerLine}</p>
      </footer>
    </main>
  );
}
