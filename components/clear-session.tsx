"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";

/**
 * Clears a stale or revoked session cookie through the logout route, then
 * sends the visitor to the login page with a notice. Rendered by server
 * components after GET /api/v1/auth/me rejects the session. A clear only
 * counts when the route confirms it explicitly (localCleared: true). After
 * the automatic attempts fail, a manual retry re-runs the clearing attempt
 * itself, so a failed sign-out can never cause a redirect loop.
 */
export function ClearSession({ notice = "expired" }: { notice?: string }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function attemptClear(remaining: number): Promise<void> {
      let cleared = false;
      try {
        const res = await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
        if (res.ok) {
          const data = (await res.json().catch(() => null)) as
            | { localCleared?: unknown }
            | null;
          cleared = data?.localCleared === true;
        }
      } catch {
        cleared = false;
      }
      if (cancelled) return;
      if (cleared) {
        router.replace(`/login?notice=${encodeURIComponent(notice)}`);
        router.refresh();
        return;
      }
      if (remaining > 0) {
        setTimeout(() => void attemptClear(remaining - 1), 600);
      } else {
        setFailed(true);
      }
    }
    void attemptClear(1);
    return () => {
      cancelled = true;
    };
  }, [attempt, notice, router]);

  if (failed) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6">
        <div className="w-full max-w-md">
          <Alert message="Your session could not be cleared automatically. Please try again." />
        </div>
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setAttempt((a) => a + 1);
          }}
          className="text-sm font-semibold text-brand-strong hover:text-brand-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
        >
          Try again
        </button>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6">
      <p className="text-sm text-foreground-muted">Signing you out…</p>
    </main>
  );
}
