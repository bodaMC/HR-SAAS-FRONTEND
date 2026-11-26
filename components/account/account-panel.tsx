"use client";

/**
 * Account tab of the employee profile (Phase 3.3): login-account state and lifecycle actions, plus the employee
 * terminate / reactivate actions. The buttons mirror `actions` computed by Laravel for THIS caller and THIS target
 * (protected accounts expose none); every action is re-authorized and re-validated server-side inside a lock.
 * A one-time temporary password is shown once in a dialog and kept only in component state.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, Link2, UserCheck, UserMinus, UserPlus, UserX, ShieldAlert, LogOut } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { TextField, TextAreaField, SelectField } from "@/components/ui/form-controls";
import type { ApiAccountState, ApiLinkCandidate } from "@/lib/types";

type Kind = "create" | "link" | "reset-password" | "deactivate" | "reactivate" | "unlink" | "terminate" | "reactivate-employee";

interface Result { ok: boolean; status: number; code: string | null; fieldErrors: Record<string, string[]>; body: { temporary_password?: string } | null }

async function post(url: string, payload: Record<string, unknown>): Promise<Result> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = (await res.json().catch(() => null)) as { code?: string; errors?: Record<string, string[]>; temporary_password?: string } | null;
    return { ok: res.ok, status: res.status, code: typeof body?.code === "string" ? body.code : null, fieldErrors: body?.errors ?? {}, body };
  } catch {
    return { ok: false, status: 0, code: null, fieldErrors: {}, body: null };
  }
}

export function AccountPanel({
  employeeId, name, defaultEmail, state, employmentStatus, canTerminate, isSelf = false,
}: {
  employeeId: number;
  name: string;
  defaultEmail: string;
  state: ApiAccountState | null;
  employmentStatus: string;
  canTerminate: boolean;
  isSelf?: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState<Kind | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("active");
  const [termDate, setTermDate] = useState("");
  const [oneTime, setOneTime] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<ApiLinkCandidate[] | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  // Link picker: minimal candidate list from the server (already filtered to accounts this caller may link).
  useEffect(() => {
    if (open !== "link") return;
    let live = true;
    const h = setTimeout(async () => {
      try {
        const res = await fetch(`/api/employees/${employeeId}/account/link-candidates?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
        const body = (await res.json().catch(() => null)) as { data?: ApiLinkCandidate[] } | null;
        if (live) setCandidates(res.ok && Array.isArray(body?.data) ? body.data : []);
      } catch {
        if (live) setCandidates([]);
      }
    }, 250);
    return () => { live = false; clearTimeout(h); };
  }, [open, query, employeeId]);

  if (!state) return null;
  const terminated = employmentStatus === "terminated";
  const a = state.actions;

  const openDialog = (k: Kind) => {
    setOpen(k); setError(null); setFieldErrors({}); setReason(""); setConfirmed(false); setPassword(""); setStatus("active"); setEmail(defaultEmail); setTermDate(""); setQuery(""); setCandidates(null); setPicked(null);
  };
  const close = () => { if (!pending) setOpen(null); };

  const errorText = (r: Result): string => {
    const key = r.code ?? (r.status === 403 ? "forbidden" : null);
    if (key && t(`account.errors.${key}`) !== `account.errors.${key}`) return t(`account.errors.${key}`);
    if (r.status === 401) return t("forms.status401");
    if (r.status === 429) return t("forms.status429");
    if (r.status === 0 || r.status === 503) return t("forms.unavailable");
    return t("account.errors.generic");
  };

  const submit = async () => {
    if (!open || pending) return;
    setPending(true); setError(null); setFieldErrors({});
    const base = { confirm_employee_uuid: state.employee_uuid, reason: reason.trim() };
    let r: Result;
    if (open === "create") {
      r = await post(`/api/employees/${employeeId}/account`, { email: email.trim(), status, confirm_employee_uuid: state.employee_uuid, ...(password ? { password } : {}), reason: reason.trim() || undefined });
    } else if (open === "link") {
      r = await post(`/api/employees/${employeeId}/account/link`, { ...base, user_id: picked });
    } else if (open === "terminate") {
      r = await post(`/api/employees/${employeeId}/terminate`, { ...base, ...(termDate ? { termination_date: termDate } : {}) });
    } else if (open === "reactivate-employee") {
      r = await post(`/api/employees/${employeeId}/reactivate`, base);
    } else {
      r = await post(`/api/employees/${employeeId}/account/${open}`, open === "reset-password" && password ? { ...base, password } : base);
    }
    setPending(false);
    if (r.ok) {
      const temp = r.body?.temporary_password ?? null;
      setOpen(null);
      if (temp) { setOneTime(temp); setCopied(false); }
      router.refresh();
      return;
    }
    if (r.status === 422) {
      setFieldErrors(r.fieldErrors);
      if (Object.keys(r.fieldErrors).length === 0) setError(t("forms.validation"));
      return;
    }
    setError(errorText(r));
  };

  const fieldErr = (f: string): string | null => {
    const c = fieldErrors[f]?.[0];
    if (!c) return null;
    if (f === "email" && c === "taken") return t("account.errors.email_taken");
    if (f === "reason") return t("account.errors.reason_required");
    if (f === "email" && c === "email") return t("forms.errors.email");
    return t(`forms.errors.${["required", "taken", "max", "email", "date"].includes(c) ? c : "invalid"}`);
  };

  const titleKey: Record<Kind, string> = {
    create: "account.createTitle", link: "account.linkTitle", "reset-password": "account.resetTitle", deactivate: "account.deactivateTitle", reactivate: "account.reactivateTitle",
    unlink: "account.unlinkTitle", terminate: "lifecycle.terminateTitle", "reactivate-employee": "lifecycle.reactivateEmployeeTitle",
  };
  const bodyKey: Partial<Record<Kind, string>> = {
    link: "account.linkConfirm", "reset-password": "account.resetConfirm", deactivate: "account.deactivateConfirm", reactivate: "account.reactivateConfirm", unlink: "account.unlinkConfirm",
    terminate: "lifecycle.terminateConfirm", "reactivate-employee": "lifecycle.reactivateEmployeeConfirm",
  };
  const needsReason = open !== null && open !== "create";
  const canSubmit = confirmed && (!needsReason || reason.trim().length >= 10) && (open !== "create" || email.trim() !== "") && (open !== "link" || picked !== null);
  const stateLabel = t(`account.states.${state.state}`);

  const btn = (k: Kind, label: string, icon: React.ReactNode, danger = false) => (
    <Button key={k} variant="ghost" onClick={() => openDialog(k)} data-testid={`account-${k}`}>
      {icon}
      <span className={danger ? "text-danger" : undefined}>{label}</span>
    </Button>
  );

  return (
    <section className="mt-6 rounded-xl border border-border bg-surface p-5" aria-labelledby="account-heading" data-testid="account-panel">
      <h2 id="account-heading" className="text-xs font-semibold tracking-wider text-foreground-muted uppercase">{t("account.title")}</h2>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span data-testid="account-state" data-state={state.state} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${state.state === "active" ? "border-brand-accent/50 text-brand-strong" : state.state === "protected" ? "border-border text-foreground-muted" : "border-danger/40 text-danger"}`}>
          {state.state === "protected" ? <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> : null}
          {stateLabel}
        </span>
        {state.login_email ? <span className="text-sm text-foreground" dir="ltr" data-testid="account-login-email">{state.login_email}</span> : null}
      </div>
      <p className="mt-2 text-sm text-foreground-muted" data-testid="account-body">
        {state.state === "no_login" ? t("account.noLoginBody") : state.state === "protected" ? t("account.protectedBody") : state.state === "password_change_required" ? t("account.passwordChangeBody") : state.state === "inactive" ? t("account.inactiveBody") : ""}
      </p>
      {isSelf ? <p className="mt-2 text-sm text-foreground-muted" data-testid="account-self-note">{t("account.selfNote")}</p> : null}
      {terminated ? <p className="mt-2 text-sm text-foreground-muted" data-testid="account-former-note">{t("lifecycle.formerNote")}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {a.create ? btn("create", t("account.create"), <UserPlus className="h-4 w-4" aria-hidden="true" />) : null}
        {a.link ? btn("link", t("account.link"), <Link2 className="h-4 w-4" aria-hidden="true" />) : null}
        {a.reset_password ? btn("reset-password", t("account.reset"), <KeyRound className="h-4 w-4" aria-hidden="true" />) : null}
        {a.deactivate ? btn("deactivate", t("account.deactivate"), <UserX className="h-4 w-4 text-danger" aria-hidden="true" />, true) : null}
        {a.reactivate ? btn("reactivate", t("account.reactivate"), <UserCheck className="h-4 w-4" aria-hidden="true" />) : null}
        {a.unlink ? btn("unlink", t("account.unlink"), <UserMinus className="h-4 w-4" aria-hidden="true" />) : null}
        {canTerminate && !terminated ? btn("terminate", t("lifecycle.terminate"), <LogOut className="h-4 w-4 text-danger" aria-hidden="true" />, true) : null}
        {canTerminate && terminated ? btn("reactivate-employee", t("lifecycle.reactivateEmployee"), <UserCheck className="h-4 w-4" aria-hidden="true" />) : null}
      </div>

      <Modal
        open={open !== null}
        title={open ? t(titleKey[open]) : ""}
        onClose={close}
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={pending}>{t("account.cancel")}</Button>
            <Button onClick={submit} loading={pending} disabled={!canSubmit} data-testid="account-dialog-confirm">{t("account.confirm")}</Button>
          </>
        }
      >
        {error ? <Alert message={error} /> : null}
        {open && bodyKey[open] ? <p className="mt-2 text-sm text-foreground" data-testid="account-dialog-body">{t(bodyKey[open]!, { name })}</p> : null}
        {open === "create" ? (
          <div className="mt-3 space-y-3">
            <TextField id="acc-email" label={t("account.loginEmail")} type="email" value={email} onChange={setEmail} error={fieldErr("email")} disabled={pending} required dir="ltr" />
            <TextField id="acc-password" label={t("account.tempPassword")} type="password" value={password} onChange={setPassword} error={fieldErr("password")} disabled={pending} dir="ltr" />
            <p className="-mt-2 text-xs text-foreground-muted">{t("account.tempPasswordHint")}</p>
            <SelectField id="acc-status" label={t("account.statusLabel")} value={status} onChange={setStatus} options={[{ value: "active", label: t("account.statusActive") }, { value: "inactive", label: t("account.statusInactive") }]} disabled={pending} />
          </div>
        ) : null}
        {open === "link" ? (
          <div className="mt-3" data-testid="account-link-picker">
            <TextField id="acc-link-search" label={t("account.linkSearch")} value={query} onChange={setQuery} disabled={pending} dir="ltr" />
            <ul role="radiogroup" aria-label={t("account.linkPick")} className="mt-2 max-h-48 space-y-1 overflow-y-auto" data-testid="account-link-list">
              {candidates === null ? <li className="text-sm text-foreground-muted">{t("account.linkLoading")}</li> : null}
              {candidates !== null && candidates.length === 0 ? <li className="text-sm text-foreground-muted" data-testid="account-link-none">{t("account.linkNone")}</li> : null}
              {(candidates ?? []).map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                    <input type="radio" name="link-candidate" checked={picked === c.id} onChange={() => setPicked(c.id)} disabled={pending} className="h-4 w-4 accent-brand-accent" data-testid={`account-link-candidate-${c.id}`} />
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium text-foreground">{c.name}</span><span className="block truncate text-foreground-muted" dir="ltr">{c.email}</span></span>
                    {!c.is_active ? <span className="text-xs text-foreground-muted">{t("account.linkInactive")}</span> : null}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {open === "reset-password" ? (
          <div className="mt-3">
            <TextField id="acc-reset-password" label={t("account.tempPassword")} type="password" value={password} onChange={setPassword} error={fieldErr("password")} disabled={pending} dir="ltr" />
            <p className="mt-1 text-xs text-foreground-muted">{t("account.tempPasswordHint")}</p>
          </div>
        ) : null}
        {open === "terminate" ? (
          <div className="mt-3">
            <TextField id="acc-term-date" label={t("lifecycle.terminationDate")} type="date" value={termDate} onChange={setTermDate} error={fieldErr("termination_date")} disabled={pending} dir="ltr" />
          </div>
        ) : null}
        {needsReason ? (
          <div className="mt-3">
            <TextAreaField id="acc-reason" label={t("account.reasonLabel")} value={reason} onChange={setReason} maxLength={500} error={fieldErr("reason")} disabled={pending} />
            <p className="mt-1 text-xs text-foreground-muted">{t("account.reasonHint")}</p>
          </div>
        ) : null}
        <label className="mt-4 flex items-start gap-2 text-sm text-foreground">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={pending} className="mt-0.5 h-4 w-4 accent-brand-accent" data-testid="account-dialog-target-confirm" />
          <span>{t(open === "create" ? "account.confirmTarget" : "lifecycle.confirmTarget", { name })}</span>
        </label>
      </Modal>

      <Modal
        open={oneTime !== null}
        title={t("account.oneTimeTitle")}
        onClose={() => setOneTime(null)}
        footer={<Button onClick={() => setOneTime(null)} data-testid="account-onetime-done">{t("account.done")}</Button>}
      >
        <p className="mt-2 text-sm text-foreground">{t("account.oneTimeBody")}</p>
        <div className="mt-3 flex items-center gap-2">
          <code dir="ltr" data-testid="account-temp-password" className="min-w-0 flex-1 rounded-lg border border-border bg-surface-muted px-3 py-2 font-mono text-sm break-all text-foreground">{oneTime}</code>
          <Button
            variant="ghost"
            onClick={async () => {
              try { await navigator.clipboard.writeText(oneTime ?? ""); setCopied(true); } catch { setCopied(false); }
            }}
            data-testid="account-temp-copy"
          >
            {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            {copied ? t("account.copied") : t("account.copy")}
          </Button>
        </div>
      </Modal>
    </section>
  );
}
