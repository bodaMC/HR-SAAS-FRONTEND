import { redirect } from "next/navigation";
import { requireSession } from "@/lib/server/guard";
import { AppShell } from "@/components/shell/app-shell";
import { ClearSession } from "@/components/clear-session";
import { Alert } from "@/components/ui/alert";
import { getI18n } from "@/lib/i18n/server";

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
  // The same shape-validated guard the pages use: a malformed identity can
  // never reach AppShell and crash its render.
  const session = await requireSession();
  if (!session.ok && session.reason === "no-token") redirect("/login");
  if (!session.ok && session.reason === "expired") {
    return <ClearSession notice="expired" />;
  }
  if (!session.ok && session.reason === "inactive") {
    return <ClearSession notice="inactive" />;
  }
  if (!session.ok) {
    const { t } = await getI18n();
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-6">
        <div className="w-full max-w-md">
          <Alert message={t("dashboard.serviceUnavailable")} />
        </div>
      </main>
    );
  }

  return <AppShell user={session.user} company={session.company}>{children}</AppShell>;
}
