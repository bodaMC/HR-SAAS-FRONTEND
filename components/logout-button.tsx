"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useI18n } from "@/lib/i18n/client";

type LogoutOutcome = { localCleared?: unknown; revoked?: unknown };

export function LogoutButton() {
  const { t } = useI18n();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    setLoading(true);
    setError(null);
    let res: Response;
    try {
      res = await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
    } catch {
      // Local session could not be cleared; stay and offer retry.
      setError(t("auth.logoutFailedNetwork"));
      setLoading(false);
      return;
    }
    const data = res.ok
      ? ((await res.json().catch(() => null)) as LogoutOutcome | null)
      : null;
    // Success requires an explicit successful local-clear outcome. A
    // missing or malformed payload means the session may still be active.
    if (!data || data.localCleared !== true) {
      setError(t("auth.logoutFailed"));
      setLoading(false);
      return;
    }
    // Local session is cleared. Remote revocation is confirmed only for an
    // explicit revoked true/false/null: true or null (no token to revoke)
    // is a confirmed sign-out; false or any missing/invalid value means
    // revocation is unconfirmed and must be reported honestly.
    const confirmed = data.revoked === true || data.revoked === null;
    router.replace(confirmed ? "/login" : "/login?notice=logout-unconfirmed");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-stretch gap-2">
      <Button
        variant="ghost"
        onClick={logout}
        loading={loading}
        className="w-full"
        data-testid="logout-button"
      >
        {t("auth.signOut")}
      </Button>
      {error && <Alert message={error} />}
    </div>
  );
}
