import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fetchMe } from "@/lib/server/api";
import { SESSION_COOKIE } from "@/lib/server/session";
import { AppShell } from "@/components/shell/app-shell";
import { ClearSession } from "@/components/clear-session";
import { Alert } from "@/components/ui/alert";

export const dynamic = "force-dynamic";

/**
 * Auth gate for every protected page. The session is validated against
 * Laravel on every render: a missing token redirects to login, a rejected
 * token (401) or inactive account (403) clears the session and returns to
 * login, and an unreachable backend shows a safe unavailable message
 * instead of a redirect loop. Authorization itself always stays with
 * Laravel on each endpoint call; this gate only guarantees a live session.
 */
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");

  let me;
  try {
    me = await fetchMe(token);
  } catch {
    me = { ok: false as const, status: null, data: null, retryAfter: null };
  }

  if (me.status === 401) {
    return <ClearSession notice="expired" />;
  }
  if (me.status === 403) {
    return <ClearSession notice="inactive" />;
  }
  if (!me.ok || !me.data?.user) {
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

  return <AppShell user={user} company={company}>{children}</AppShell>;
}
