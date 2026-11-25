"use client";

/**
 * Roles & Permissions (Phase 3.2). Three sections: Roles, Permissions, User
 * Assignments. All writes go through the same-origin BFF; Laravel enforces the
 * delegation boundary on every call. The UI only mirrors it: permissions
 * outside the caller's boundary are disabled, and every sensitive change goes
 * through a review step before it is sent. Refusal codes from the backend are
 * mapped to localized, app-owned messages (no raw backend text is shown).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { TextField, TextAreaField, CheckboxField } from "@/components/ui/form-controls";
import { Alert } from "@/components/ui/alert";
import { permissionLabel, pluralKey } from "@/lib/access-labels";
import type { AccessUsersMeta, ApiAccessUser, ApiPermissionRegistry, ApiRole } from "@/lib/types";

type Tab = "roles" | "permissions" | "users";
interface Can { create: boolean; update: boolean; delete: boolean; assign: boolean; managePermissions: boolean }

const KNOWN_CODES = [
  "delegation_exceeded", "role_protected", "role_in_use", "self_assignment", "self_escalation",
  "last_administrator", "invalid_target", "invalid_role", "forbidden", "not_found",
];

function errorKey(status: number, body: unknown): string {
  const code = (body as { code?: unknown } | null)?.code;
  if (typeof code === "string" && KNOWN_CODES.includes(code)) return `access.errors.${code}`;
  if (status === 401) return "forms.status401";
  if (status === 422) return "forms.validation";
  if (status === 403) return "forms.forbidden";
  if (status === 409) return "forms.status409";
  return "forms.unavailable";
}

function diff(before: string[], after: string[]) {
  return {
    added: after.filter((p) => !before.includes(p)),
    removed: before.filter((p) => !after.includes(p)),
  };
}

function PermissionMatrix({
  registry, selected, onToggle, disabled,
}: {
  registry: ApiPermissionRegistry;
  selected: string[];
  onToggle?: (code: string, on: boolean) => void;
  disabled?: boolean;
}) {
  const { t, locale } = useI18n();
  return (
    <div className="space-y-4" data-testid="permission-matrix">
      {registry.groups.map((g) => (
        <fieldset key={g.key} className="rounded-lg border border-border p-3">
          <legend className="px-1 text-xs font-semibold tracking-wider text-foreground-muted uppercase">
            {t(`access.groups.${g.key}`)}
          </legend>
          <ul className="grid gap-2 sm:grid-cols-2">
            {g.permissions.map((p) => {
              const locked = !p.grantable_by_you;
              return (
                <li key={p.code} title={locked ? t("access.roles.notGrantable") : undefined}>
                  <div className="flex items-center gap-2">
                    <input
                      id={`perm-${p.code}`}
                      type="checkbox"
                      data-perm={p.code}
                      checked={selected.includes(p.code)}
                      disabled={disabled || !onToggle || (locked && !selected.includes(p.code)) || locked}
                      onChange={(e) => onToggle?.(p.code, e.target.checked)}
                      className="h-4 w-4 rounded border-border accent-brand-accent"
                    />
                    <label htmlFor={`perm-${p.code}`} className="min-w-0 text-sm text-foreground">
                      <span data-testid={`perm-label-${p.code}`} className="block break-words">{permissionLabel(p.code, locale)}</span>
                      <span dir="ltr" className="block font-mono text-[11px] text-foreground-muted">{p.code}</span>
                    </label>
                    {locked ? <Lock className="h-3 w-3 text-foreground-muted" aria-label={t("access.roles.notGrantable")} /> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
    </div>
  );
}

export function AccessManager({
  roles, registry, users: initialUsers, usersMeta: initialMeta, can, viewerIsSystemAdmin,
}: {
  roles: ApiRole[] | null;
  registry: ApiPermissionRegistry | null;
  users: ApiAccessUser[] | null;
  usersMeta: AccessUsersMeta | null;
  can: Can;
  /** Server decides; the UI only mirrors it: protected roles are assignable by the tenant System Super Admin only. */
  viewerIsSystemAdmin: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const tabs: Tab[] = [
    ...(roles ? (["roles"] as Tab[]) : []),
    "permissions",
    ...(initialUsers ? (["users"] as Tab[]) : []),
  ];
  const [tab, setTab] = useState<Tab>(tabs[0]);
  const [pending, setPending] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  // Role editor
  const [editing, setEditing] = useState<ApiRole | "new" | null>(null);
  const [form, setForm] = useState({ name: "", name_ar: "", description: "", permissions: [] as string[] });
  const [reviewing, setReviewing] = useState(false);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<ApiRole | null>(null);

  // Permissions tab + users tab
  const [permQuery, setPermQuery] = useState("");
  const [userQuery, setUserQuery] = useState("");
  // Account directory: server-side search and pagination (never filters only a preloaded subset).
  const [users, setUsers] = useState<ApiAccessUser[] | null>(initialUsers);
  const [meta, setMeta] = useState<AccessUsersMeta | null>(initialMeta);
  const [userPage, setUserPage] = useState(1);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState(false);
  const firstLoad = useRef(true);
  const reqSeq = useRef(0);
  const [assigning, setAssigning] = useState<ApiAccessUser | null>(null);
  const [roleIds, setRoleIds] = useState<number[]>([]);
  const [assignReview, setAssignReview] = useState(false);
  const [effective, setEffective] = useState<string[] | null>(null);

  const loadUsers = async (search: string, page: number) => {
    const seq = ++reqSeq.current;
    setUsersLoading(true);
    setUsersError(false);
    try {
      const qs = new URLSearchParams({ page: String(page), per_page: "25" });
      if (search.trim()) qs.set("search", search.trim());
      const res = await fetch(`/api/access/users?${qs.toString()}`, { cache: "no-store" });
      const j = (await res.json().catch(() => null)) as { data?: ApiAccessUser[]; meta?: AccessUsersMeta } | null;
      if (seq !== reqSeq.current) return; // a newer request superseded this one
      if (!res.ok || !j || !Array.isArray(j.data) || !j.meta) {
        setUsersError(true);
      } else {
        setUsers(j.data);
        setMeta(j.meta);
      }
    } catch {
      if (seq === reqSeq.current) setUsersError(true);
    } finally {
      if (seq === reqSeq.current) setUsersLoading(false);
    }
  };

  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    const id = setTimeout(() => void loadUsers(userQuery, userPage), userPage === 1 ? 250 : 0);
    return () => clearTimeout(id);
  }, [userQuery, userPage]);

  const label = (r: ApiRole) => (locale === "ar" && r.name_ar ? r.name_ar : r.name);

  const send = async (url: string, method: "POST" | "PUT" | "DELETE", body?: unknown): Promise<boolean> => {
    if (pending) return false;
    setPending(true);
    setFatal(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (res.ok) {
        router.refresh();
        return true;
      }
      const json = await res.json().catch(() => null);
      if (res.status === 422 && json && typeof json === "object" && "errors" in json) {
        const errs = (json as { errors?: Record<string, string[]> }).errors ?? {};
        const next: Record<string, string> = {};
        for (const [k, v] of Object.entries(errs)) if (v?.[0]) next[k] = v[0];
        setFieldErr(next);
        setReviewing(false);
        setFatal("forms.validation");
        return false;
      }
      setFatal(errorKey(res.status, json));
      return false;
    } catch {
      setFatal("forms.unavailable");
      return false;
    } finally {
      setPending(false);
    }
  };

  const openRole = (r: ApiRole | "new") => {
    setFatal(null);
    setFieldErr({});
    setReviewing(false);
    setForm(
      r === "new"
        ? { name: "", name_ar: "", description: "", permissions: [] }
        : { name: r.name, name_ar: r.name_ar ?? "", description: r.description ?? "", permissions: [...r.permissions] },
    );
    setEditing(r);
  };

  const saveRole = async () => {
    const body = {
      name: form.name.trim(),
      name_ar: form.name_ar.trim() === "" ? null : form.name_ar.trim(),
      description: form.description.trim() === "" ? null : form.description.trim(),
      // Without permissions.manage the permissions key is not sent at all (the server would refuse it).
      ...(can.managePermissions ? { permissions: form.permissions } : {}),
    };
    const ok =
      editing === "new"
        ? await send("/api/access/roles", "POST", body)
        : await send(`/api/access/roles/${(editing as ApiRole).id}`, "PUT", body);
    if (ok) setEditing(null);
  };

  const openAssign = async (u: ApiAccessUser) => {
    setFatal(null);
    setAssignReview(false);
    setRoleIds(u.roles.map((r) => r.id));
    setEffective(null);
    setAssigning(u);
    try {
      const res = await fetch(`/api/access/users/${u.id}/permissions`, { cache: "no-store" });
      const j = (await res.json().catch(() => null)) as { data?: { effective_permissions?: string[] } } | null;
      setEffective(res.ok ? (j?.data?.effective_permissions ?? []) : []);
    } catch {
      setEffective([]);
    }
  };

  const saveAssign = async () => {
    if (!assigning) return;
    const ok = await send(`/api/access/users/${assigning.id}/roles`, "PUT", { role_ids: roleIds });
    if (ok) setAssigning(null);
  };

  const filteredPerms = useMemo(() => {
    const q = permQuery.trim().toLowerCase();
    if (!registry) return [];
    return registry.groups
      .map((g) => ({
        ...g,
        permissions: g.permissions.filter((p) => !q || p.code.includes(q) || permissionLabel(p.code, locale).toLowerCase().includes(q) || t(`access.groups.${g.key}`).toLowerCase().includes(q)),
      }))
      .filter((g) => g.permissions.length > 0);
  }, [registry, permQuery, t, locale]);

  const roleDiff = editing && editing !== "new" ? diff(editing.permissions, form.permissions) : diff([], form.permissions);
  const assignedBefore = assigning ? assigning.roles.map((r) => r.id) : [];
  const roleName = (id: number) => {
    const r = roles?.find((x) => x.id === id);
    return r ? label(r) : String(id);
  };

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0" data-testid="access-page">
      <h1 className="text-xl font-bold text-foreground">{t("access.title")}</h1>
      <p className="mt-1 text-sm text-foreground-muted">{t("access.subtitle")}</p>

      <div role="tablist" aria-label={t("access.tabs.label")} className="mt-4 flex flex-wrap gap-2 border-b border-border">
        {tabs.map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            data-testid={`access-tab-${k}`}
            onClick={() => setTab(k)}
            className={`min-h-11 px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-brand-accent ${
              tab === k ? "border-b-2 border-brand-accent text-foreground" : "text-foreground-muted hover:text-foreground"
            }`}
          >
            {t(`access.tabs.${k}`)}
          </button>
        ))}
      </div>

      {fatal && !editing && !assigning && !deleting ? <div className="mt-4"><Alert message={t(fatal)} /></div> : null}

      {tab === "roles" && roles ? (
        <section className="mt-4" data-testid="access-roles">
          {can.create && registry ? (
            <div className="mb-3 flex justify-end">
              <Button onClick={() => openRole("new")} data-testid="role-add">{t("access.roles.add")}</Button>
            </div>
          ) : null}
          {roles.length === 0 ? (
            <p className="text-sm text-foreground-muted">{t("access.roles.empty")}</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {roles.map((r) => (
                <li key={r.id} data-testid={`role-${r.key}`} className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words font-semibold text-foreground">{label(r)}</p>
                      <p className="mt-1 line-clamp-2 break-words text-sm text-foreground-muted">{r.description ?? "—"}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-foreground-muted">
                      {r.is_protected ? t("access.roles.protected") : r.is_system ? t("access.roles.system") : t("access.roles.custom")}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-foreground-muted">
                    {t(pluralKey(locale, "access.roles.permissionsCount", r.permissions.length), { count: r.permissions.length })} · {t(pluralKey(locale, "access.roles.usersCount", r.users_count), { count: r.users_count })}
                  </p>
                  <div className="mt-3 flex justify-end gap-2 border-t border-border pt-3">
                    {registry ? (
                      <Button variant="ghost" className="h-9 px-3" onClick={() => openRole(r)} data-testid={`role-open-${r.key}`}>
                        {can.update && !r.is_protected ? t("access.roles.edit") : t("access.roles.view")}
                      </Button>
                    ) : null}
                    {can.delete && !r.is_system && !r.is_protected ? (
                      <Button variant="ghost" className="h-9 px-3" onClick={() => { setFatal(null); setDeleting(r); }} data-testid={`role-delete-${r.key}`}>
                        {t("access.roles.delete")}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === "permissions" ? (
        <section className="mt-4" data-testid="access-permissions">
          {registry ? (
            <>
              <h2 className="text-sm font-semibold text-foreground">{t("access.permissionsTab.heading")}</h2>
              <input
                type="search"
                value={permQuery}
                onChange={(e) => setPermQuery(e.target.value)}
                placeholder={t("access.permissionsTab.search")}
                aria-label={t("access.permissionsTab.search")}
                className="mt-2 w-full max-w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground sm:w-72"
              />
              <div className="mt-3">
                <PermissionMatrix registry={{ ...registry, groups: filteredPerms }} selected={registry.your_permissions} />
              </div>
              <p className="mt-3 text-xs text-foreground-muted">{t("access.permissionsTab.protectedNote")}</p>
              <p className="mt-1 text-xs text-foreground-muted">{t("access.permissionsTab.reservedNote")}</p>
            </>
          ) : (
            <p className="text-sm text-foreground-muted">{t("access.roles.unavailable")}</p>
          )}
        </section>
      ) : null}

      {tab === "users" && users ? (
        <section className="mt-4" data-testid="access-users">
          <p className="mb-3 text-xs text-foreground-muted">{t("access.users.noteNoCreate")}</p>
          <input
            type="search"
            value={userQuery}
            onChange={(e) => { setUserQuery(e.target.value); setUserPage(1); }}
            placeholder={t("access.users.search")}
            aria-label={t("access.users.search")}
            className="w-full max-w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground sm:w-72"
          />
          {(users ?? []).length === 0 ? (
            <p className="mt-4 text-sm text-foreground-muted">{t("access.users.empty")}</p>
          ) : (
            <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">
              {(users ?? []).map((u) => (
                <li key={u.id} data-testid={`access-user-${u.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-foreground">{u.name}{!u.is_active ? ` · ${t("access.users.inactive")}` : ""}</p>
                    <p dir="ltr" className="break-all text-xs text-foreground-muted">{u.email}</p>
                    <p className="mt-1 text-xs text-foreground-muted">
                      {u.roles.length === 0 ? t("access.users.noRoles") : u.roles.map((r) => (locale === "ar" && r.name_ar ? r.name_ar : r.name)).join(", ")}
                    </p>
                  </div>
                  <Button variant="ghost" className="h-9 px-3" onClick={() => void openAssign(u)} data-testid={`access-assign-${u.id}`}>
                    {can.assign && !u.roles.some((r) => r.key === "system_super_admin") ? t("access.users.assign") : t("access.roles.view")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {usersError ? <div className="mt-3"><Alert message={t("access.users.unavailableSearch")} /></div> : null}
          {meta ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-foreground-muted" data-testid="users-pager" aria-busy={usersLoading}>
              <span data-testid="users-total">{t(pluralKey(locale, "access.users.results", meta.total), { count: meta.total })}</span>
              <span className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end">
                <Button variant="ghost" className="h-9 min-w-0 px-3 text-xs" disabled={usersLoading || meta.current_page <= 1} onClick={() => setUserPage((p) => Math.max(1, p - 1))} data-testid="users-prev">{t("access.users.prev")}</Button>
                <span data-testid="users-page" className="whitespace-nowrap">{t("access.users.page", { page: meta.current_page, pages: Math.max(1, meta.last_page) })}</span>
                <Button variant="ghost" className="h-9 min-w-0 px-3 text-xs" disabled={usersLoading || meta.current_page >= meta.last_page} onClick={() => setUserPage((p) => p + 1)} data-testid="users-next">{t("access.users.next")}</Button>
              </span>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Role editor */}
      <Modal
        open={editing !== null}
        title={editing === "new" ? t("access.roles.add") : reviewing ? t("access.roles.reviewTitle") : t("access.roles.edit")}
        onClose={() => setEditing(null)}
        footer={
          (editing === "new" ? can.create : can.update && editing !== null && !(editing as ApiRole).is_protected) ? (
            reviewing ? (
              <>
                <Button variant="ghost" onClick={() => setReviewing(false)} disabled={pending}>{t("access.roles.back")}</Button>
                <Button onClick={() => void saveRole()} loading={pending} data-testid="role-confirm">{t("access.roles.confirm")}</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setEditing(null)}>{t("forms.cancel")}</Button>
                <Button onClick={() => setReviewing(true)} disabled={form.name.trim() === ""} data-testid="role-review">{t("access.roles.review")}</Button>
              </>
            )
          ) : (
            <Button variant="ghost" onClick={() => setEditing(null)}>{t("forms.close")}</Button>
          )
        }
      >
        {fatal && editing ? <div className="mb-3"><Alert message={t(fatal)} /></div> : null}
        {editing && registry ? (
          reviewing ? (
            <div data-testid="role-review-panel" className="space-y-3 text-sm">
              <p className="font-semibold text-foreground">{form.name}</p>
              <p className="text-foreground-muted">{t("access.roles.added")}: {roleDiff.added.length ? roleDiff.added.map((c) => permissionLabel(c, locale)).join(", ") : t("access.roles.none")}</p>
              <p className="text-foreground-muted">{t("access.roles.removed")}: {roleDiff.removed.length ? roleDiff.removed.map((c) => permissionLabel(c, locale)).join(", ") : t("access.roles.none")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(() => {
                const editable = editing === "new" ? can.create : can.update && !(editing as ApiRole).is_protected;
                return (
                  <>
                    <TextField id="role-name" label={t("access.roles.name")} value={form.name} onChange={(v) => setForm({ ...form, name: v })} required maxLength={100} disabled={!editable} error={fieldErr.name ? t("forms.errors.taken") : null} />
                    <TextField id="role-name-ar" label={t("access.roles.nameAr")} value={form.name_ar} onChange={(v) => setForm({ ...form, name_ar: v })} maxLength={100} disabled={!editable} dir="rtl" />
                    <TextAreaField id="role-desc" label={t("access.roles.description")} value={form.description} onChange={(v) => setForm({ ...form, description: v })} maxLength={500} disabled={!editable} />
                    <h3 className="text-sm font-semibold text-foreground">{t("access.roles.permissionsHeading")}</h3>
                    {editable && !can.managePermissions ? <p className="text-xs text-foreground-muted" data-testid="permissions-locked-note">{t("access.roles.permissionsLocked")}</p> : null}
                    <PermissionMatrix
                      registry={registry}
                      selected={form.permissions}
                      disabled={!editable || !can.managePermissions}
                      onToggle={(code, on) =>
                        setForm({ ...form, permissions: on ? [...form.permissions, code] : form.permissions.filter((p) => p !== code) })
                      }
                    />
                  </>
                );
              })()}
            </div>
          )
        ) : null}
      </Modal>

      {/* Delete */}
      <Modal
        open={deleting !== null}
        title={t("access.roles.deleteTitle")}
        onClose={() => setDeleting(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={pending}>{t("forms.cancel")}</Button>
            <Button
              loading={pending}
              data-testid="role-delete-confirm"
              onClick={async () => { if (deleting && (await send(`/api/access/roles/${deleting.id}`, "DELETE"))) setDeleting(null); }}
            >
              {t("access.roles.delete")}
            </Button>
          </>
        }
      >
        {fatal && deleting ? <div className="mb-3"><Alert message={t(fatal)} /></div> : null}
        <p className="text-sm text-foreground">{deleting ? `${label(deleting)}: ` : ""}{t("access.roles.deleteBody")}</p>
      </Modal>

      {/* Assign */}
      <Modal
        open={assigning !== null}
        title={assignReview ? t("access.users.reviewTitle") : t("access.users.title")}
        onClose={() => setAssigning(null)}
        footer={
          can.assign ? (
            assignReview ? (
              <>
                <Button variant="ghost" onClick={() => setAssignReview(false)} disabled={pending}>{t("access.roles.back")}</Button>
                <Button onClick={() => void saveAssign()} loading={pending} data-testid="assign-confirm">{t("access.roles.confirm")}</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setAssigning(null)}>{t("forms.cancel")}</Button>
                <Button onClick={() => setAssignReview(true)} data-testid="assign-review">{t("access.roles.review")}</Button>
              </>
            )
          ) : (
            <Button variant="ghost" onClick={() => setAssigning(null)}>{t("forms.close")}</Button>
          )
        }
      >
        {fatal && assigning ? <div className="mb-3"><Alert message={t(fatal)} /></div> : null}
        {assigning ? (
          assignReview ? (
            <div data-testid="assign-review-panel" className="space-y-2 text-sm text-foreground-muted">
              <p className="font-semibold text-foreground">{assigning.name}</p>
              <p>{t("access.roles.added")}: {roleIds.filter((i) => !assignedBefore.includes(i)).map(roleName).join(", ") || t("access.roles.none")}</p>
              <p>{t("access.roles.removed")}: {assignedBefore.filter((i) => !roleIds.includes(i)).map(roleName).join(", ") || t("access.roles.none")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">{assigning.name}</p>
              <p dir="ltr" className="text-xs text-foreground-muted">{assigning.email}</p>
              <div className="space-y-2">
                {(roles ?? []).map((r) => (
                  <CheckboxField
                    key={r.id}
                    id={`assign-role-${r.id}`}
                    label={label(r)}
                    checked={roleIds.includes(r.id)}
                    disabled={!can.assign || r.key === "system_super_admin" || (r.is_protected && !viewerIsSystemAdmin) || assigning.roles.some((x) => x.key === "system_super_admin")}
                    onChange={(on) => setRoleIds(on ? [...roleIds, r.id] : roleIds.filter((i) => i !== r.id))}
                  />
                ))}
              </div>
              <h3 className="text-sm font-semibold text-foreground">{t("access.users.effective")}</h3>
              {effective === null ? (
                <p className="text-xs text-foreground-muted">{t("access.users.loading")}</p>
              ) : (
                effective.length ? (
                  <ul data-testid="effective-permissions" className="space-y-1 text-xs text-foreground-muted">
                    {effective.map((c) => (
                      <li key={c}>
                        <span>{permissionLabel(c, locale)}</span>{" "}
                        <span dir="ltr" className="font-mono text-[11px]">({c})</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p data-testid="effective-permissions" className="text-xs text-foreground-muted">—</p>
                )
              )}
            </div>
          )
        ) : null}
      </Modal>
    </div>
  );
}
