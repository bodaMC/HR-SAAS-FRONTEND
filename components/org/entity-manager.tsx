"use client";

/**
 * Departments / Job Titles manager (Phase 3). Client-side search + status
 * filtering over the complete, validated collection (the backend list has
 * no search parameter, so filtering happens here over authorized data only).
 * Create/edit/delete go through the same-origin BFF; field errors are
 * app-owned codes mapped through the dictionary; duplicate submissions are
 * blocked; the list refreshes from the server after every mutation.
 * Add/edit/delete controls render only for owner/admin (policy UX mirror);
 * the backend enforces authorization on every call regardless.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { failureKey, readFailureCode, type FailureCode } from "@/lib/api-errors";
import { useI18n } from "@/lib/i18n/client";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { TextField, TextAreaField, CheckboxField } from "@/components/ui/form-controls";
import { Alert } from "@/components/ui/alert";
import { ActionIconButton } from "@/components/ui/action-icon";
import type { ApiDepartment } from "@/lib/types";

interface Props {
  section: "departments" | "jobTitles";
  apiPath: string;
  items: ApiDepartment[];
  canManage: boolean;
}

type FormState = { name: string; description: string; is_active: boolean };

export function EntityManager({ section, apiPath, items, canManage }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [editing, setEditing] = useState<ApiDepartment | null | "new">(null);
  const [viewing, setViewing] = useState<ApiDepartment | null>(null);
  const [deleting, setDeleting] = useState<ApiDepartment | null>(null);
  const [form, setForm] = useState<FormState>({ name: "", description: "", is_active: true });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [fatal, setFatal] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (statusFilter === "active" && !it.is_active) return false;
      if (statusFilter === "inactive" && it.is_active) return false;
      if (q && !`${it.name} ${it.description ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, query, statusFilter]);

  const openCreate = () => {
    setForm({ name: "", description: "", is_active: true });
    setErrors({});
    setFatal(null);
    setEditing("new");
  };
  const openEdit = (item: ApiDepartment) => {
    setForm({ name: item.name, description: item.description ?? "", is_active: item.is_active });
    setErrors({});
    setFatal(null);
    setEditing(item);
  };

  /* Fatal state holds a dictionary KEY, not a translated string, so the
   * rendered message follows the active language without resubmitting. */
  const fatalKey = (status: number, code: FailureCode | null): string =>
    failureKey(status, code, "forms.forbidden", "forms.submitError");

  /* Returns true when at least one field error was mapped; a 422 with no
   * known field errors must surface a generic localized message instead
   * of failing silently. */
  const mapErrors = (body: unknown): boolean => {
    const errs =
      body && typeof body === "object" ? (body as { errors?: Record<string, string[]> }).errors : undefined;
    const clean = errs && typeof errs === "object" ? errs : {};
    setErrors(clean);
    return Object.keys(clean).length > 0;
  };

  const submit = async () => {
    if (pending) return; // duplicate-submission guard
    setPending(true);
    setFatal(null);
    setErrors({});
    try {
      const isNew = editing === "new";
      const res = await fetch(isNew ? apiPath : `${apiPath}/${(editing as ApiDepartment).id}`, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() === "" ? null : form.description.trim(),
          is_active: form.is_active,
        }),
      });
      if (res.ok) {
        setEditing(null);
        router.refresh();
        return;
      }
      if (res.status === 422) {
        if (!mapErrors(await res.json().catch(() => null))) setFatal("forms.validation");
        return;
      }
      setFatal(fatalKey(res.status, readFailureCode(await res.json().catch(() => null))));
    } catch {
      setFatal("forms.unavailable");
    } finally {
      setPending(false);
    }
  };

  const confirmDelete = async () => {
    if (pending || !deleting) return;
    setPending(true);
    setFatal(null);
    try {
      const res = await fetch(`${apiPath}/${deleting.id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleting(null);
        router.refresh();
        return;
      }
      setFatal(fatalKey(res.status, readFailureCode(await res.json().catch(() => null))));
    } catch {
      setFatal("forms.unavailable");
    } finally {
      setPending(false);
    }
  };

  const fieldError = (f: string) =>
    errors[f]?.[0] ? t(`forms.errors.${errors[f][0]}`) : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-foreground">{t(`${section}.title`)}</h1>
        {canManage ? (
          <Button onClick={openCreate} data-testid="entity-add">
            {t(`${section}.add`)}
          </Button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(`${section}.searchPlaceholder`)}
          aria-label={t(`${section}.searchPlaceholder`)}
          className="w-full max-w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted sm:w-72"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          aria-label={t(`${section}.filterStatus`)}
          className="w-full max-w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground sm:w-auto"
        >
          <option value="all">{t(`${section}.statusAll`)}</option>
          <option value="active">{t(`${section}.statusActive`)}</option>
          <option value="inactive">{t(`${section}.statusInactive`)}</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <p data-testid="entity-empty" className="mt-6 text-sm text-foreground-muted">
          {t(`${section}.empty`)}
        </p>
      ) : (
        <>
        {/* Mobile + tablet record cards (below lg). Same validated data and
            the same mutation handlers as the desktop table - presentation
            only, no duplicated business logic. */}
        <ul className="mt-4 space-y-3 lg:hidden" data-testid="entity-cards">
          {filtered.map((it) => (
            <li key={it.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words font-medium text-foreground">{it.name}</p>
                  <p className="mt-1 line-clamp-2 break-words text-sm text-foreground-muted">
                    {it.description ?? "—"}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    it.is_active
                      ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                      : "bg-surface-muted text-foreground-muted"
                  }`}
                >
                  {it.is_active ? t(`${section}.active`) : t(`${section}.inactive`)}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-end gap-1 border-t border-border pt-3">
                <ActionIconButton kind="view" label={t(`${section}.view`)} onClick={() => setViewing(it)} />
                {canManage ? (
                  <>
                    <ActionIconButton kind="edit" label={t("employees.edit")} onClick={() => openEdit(it)} />
                    <ActionIconButton
                      kind="delete"
                      label={t(`${section}.deleteTitle`)}
                      onClick={() => {
                        setFatal(null);
                        setDeleting(it);
                      }}
                    />
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        {/* Desktop table (lg and up): unchanged from the approved design. */}
        <div
          className="mt-4 hidden overflow-x-auto rounded-xl border border-border bg-surface lg:block"
          role="region"
          aria-label={t(`${section}.title`)}
          tabIndex={0}
        >
          <table className="w-full min-w-[560px] text-start text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs uppercase tracking-wider text-foreground-muted">
                <th className="px-4 py-3 text-start font-semibold">{t(`${section}.colName`)}</th>
                <th className="px-4 py-3 text-start font-semibold">{t(`${section}.colDescription`)}</th>
                <th className="px-4 py-3 text-start font-semibold">{t(`${section}.colStatus`)}</th>
                <th className="px-4 py-3 text-start font-semibold">{t(`${section}.colActions`)}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr key={it.id} className="border-b border-border last:border-0">
                  <td className="max-w-[220px] truncate px-4 py-3 font-medium text-foreground" title={it.name}>
                    {it.name}
                  </td>
                  <td className="max-w-[280px] truncate px-4 py-3 text-foreground-muted">
                    {it.description ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        it.is_active
                          ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                          : "bg-surface-muted text-foreground-muted"
                      }`}
                    >
                      {it.is_active ? t(`${section}.active`) : t(`${section}.inactive`)}
                    </span>
                  </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <ActionIconButton kind="view" label={t(`${section}.view`)} onClick={() => setViewing(it)} />
                        {canManage ? (
                          <>
                            <ActionIconButton kind="edit" label={t("employees.edit")} onClick={() => openEdit(it)} />
                            <ActionIconButton
                              kind="delete"
                              label={t(`${section}.deleteTitle`)}
                              onClick={() => {
                                setFatal(null);
                                setDeleting(it);
                              }}
                            />
                          </>
                        ) : null}
                      </div>
                    </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      <Modal
        open={editing !== null}
        title={editing === "new" ? t(`${section}.add`) : t(`${section}.editTitle`)}
        onClose={() => !pending && setEditing(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={pending}>
              {t("forms.cancel")}
            </Button>
            <Button onClick={submit} loading={pending} data-testid="entity-submit">
              {t("forms.save")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {fatal ? <Alert message={t(fatal)} /> : null}
          <TextField
            id="entity-name"
            label={t(`${section}.colName`)}
            value={form.name}
            onChange={(v) => setForm((f) => ({ ...f, name: v }))}
            required
            maxLength={255}
            error={fieldError("name")}
            disabled={pending}
          />
          <TextAreaField
            id="entity-description"
            label={t(`${section}.colDescription`)}
            value={form.description}
            onChange={(v) => setForm((f) => ({ ...f, description: v }))}
            maxLength={1000}
            error={fieldError("description")}
            disabled={pending}
          />
          <CheckboxField
            id="entity-active"
            label={t(`${section}.statusActive`)}
            checked={form.is_active}
            onChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
            disabled={pending}
          />
        </div>
      </Modal>

      <Modal
        open={viewing !== null}
        title={t(`${section}.viewTitle`)}
        onClose={() => setViewing(null)}
        footer={
          <Button variant="ghost" onClick={() => setViewing(null)}>
            {t("forms.close")}
          </Button>
        }
      >
        {viewing ? (
          <dl className="space-y-3 text-sm" data-testid="entity-view">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                {t(`${section}.colName`)}
              </dt>
              <dd className="mt-0.5 font-medium text-foreground">{viewing.name}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                {t(`${section}.colDescription`)}
              </dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-foreground">
                {viewing.description ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                {t(`${section}.colStatus`)}
              </dt>
              <dd className="mt-0.5">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    viewing.is_active
                      ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                      : "bg-surface-muted text-foreground-muted"
                  }`}
                >
                  {viewing.is_active ? t(`${section}.active`) : t(`${section}.inactive`)}
                </span>
              </dd>
            </div>
          </dl>
        ) : null}
      </Modal>

      <Modal
        open={deleting !== null}
        title={t(`${section}.deleteTitle`)}
        onClose={() => !pending && setDeleting(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={pending}>
              {t("forms.cancel")}
            </Button>
            <Button onClick={confirmDelete} loading={pending} data-testid="entity-delete-confirm">
              {t(`${section}.deleteTitle`)}
            </Button>
          </>
        }
      >
        {fatal ? <Alert message={t(fatal)} /> : null}
        <p className="mt-2 text-sm text-foreground">
          {t(`${section}.deleteConfirm`, { name: deleting?.name ?? "" })}
        </p>
      </Modal>
    </div>
  );
}
