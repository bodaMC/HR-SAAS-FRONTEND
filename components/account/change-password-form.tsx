"use client";

/**
 * Change password (voluntary) and the forced first-login variant. The browser only talks to the same-origin BFF;
 * on success the BFF swaps the HttpOnly session cookie for the renewed session. Policy hints mirror the backend
 * (10+ characters, upper and lower case, a number); the backend remains the authority.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { failureKey, readFailureCode } from "@/lib/api-errors";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { TextField } from "@/components/ui/form-controls";

export function ChangePasswordForm({ forced = false }: { forced?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [fatal, setFatal] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const type = show ? "text" : "password";
  const fe = (f: string) => (errors[f]?.[0] ? t(`password.errors.${errors[f][0]}`) : null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const local: Record<string, string[]> = {};
    if (!current) local.current_password = ["required"];
    if (!next) local.password = ["required"];
    else if (next.length < 10) local.password = ["password_min"];
    else if (!/[a-z]/.test(next) || !/[A-Z]/.test(next)) local.password = ["password_letters"];
    else if (!/\d/.test(next)) local.password = ["password_numbers"];
    else if (next === current) local.password = ["password_same"];
    if (next !== confirm) local.password_confirmation = ["password_mismatch"];
    setErrors(local);
    setFatal(null);
    if (Object.keys(local).length > 0) return;
    setPending(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: current, password: next, password_confirmation: confirm }),
      });
      if (res.ok) {
        setCurrent("");
        setNext("");
        setConfirm("");
        if (forced) {
          // Full navigation: the session cookie was replaced, drop every piece of client state.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- deliberate hard navigation after the session cookie swap
          window.location.assign("/");
          return;
        }
        setDone(true);
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => null)) as { errors?: Record<string, string[]> } | null;
      if (res.status === 422) {
        const errs = body?.errors && typeof body.errors === "object" ? body.errors : {};
        setErrors(errs);
        if (Object.keys(errs).length === 0) setFatal("forms.validation");
        return;
      }
      setFatal(failureKey(res.status, readFailureCode(body), "forms.forbidden", "forms.submitError"));
    } catch {
      setFatal("forms.unavailable");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4" data-testid={forced ? "first-login-form" : "change-password-form"}>
      {fatal ? <Alert message={t(fatal)} /> : null}
      {done ? (
        <p role="status" data-testid="password-changed" className="rounded-lg border border-border bg-surface-muted px-4 py-3 text-sm text-foreground">
          {t("password.success")}
        </p>
      ) : null}
      <TextField id="pw-current" label={t("password.current")} type={type} value={current} onChange={setCurrent} error={fe("current_password")} disabled={pending} required dir="ltr" />
      <TextField id="pw-new" label={t("password.next")} type={type} value={next} onChange={setNext} error={fe("password")} disabled={pending} required dir="ltr" />
      <p className="-mt-2 text-xs text-foreground-muted">{t("password.rules")}</p>
      <TextField id="pw-confirm" label={t("password.confirm")} type={type} value={confirm} onChange={setConfirm} error={fe("password_confirmation")} disabled={pending} required dir="ltr" />
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="h-4 w-4 accent-brand-accent" data-testid="pw-show" />
        {t("password.show")}
      </label>
      <Button type="submit" loading={pending} data-testid="pw-submit">
        {t("password.submit")}
      </Button>
    </form>
  );
}
