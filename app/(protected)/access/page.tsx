import { redirect } from "next/navigation";
import { fetchAccess } from "@/lib/server/api";
import { requireSession } from "@/lib/server/guard";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/access";
import { ClearSession } from "@/components/clear-session";
import { Alert } from "@/components/ui/alert";
import { RestrictedPage } from "@/components/restricted-page";
import { AccessManager } from "@/components/access/access-manager";
import type { AccessUsersMeta, ApiAccessUser, ApiPermissionRegistry, ApiRole } from "@/lib/types";

export const dynamic = "force-dynamic";

function isRoleList(v: unknown): v is ApiRole[] {
  return (
    Array.isArray(v) &&
    v.every(
      (r) =>
        typeof r === "object" && r !== null && typeof r.id === "number" && typeof r.name === "string" &&
        Array.isArray(r.permissions) && typeof r.is_system === "boolean" && typeof r.is_protected === "boolean",
    )
  );
}
function isUserList(v: unknown): v is ApiAccessUser[] {
  return (
    Array.isArray(v) &&
    v.every(
      (u) =>
        typeof u === "object" && u !== null && typeof u.id === "number" && typeof u.name === "string" &&
        typeof u.email === "string" && Array.isArray(u.roles),
    )
  );
}
function isMeta(v: unknown): v is AccessUsersMeta {
  const m = v as AccessUsersMeta | null;
  return !!m && [m.total, m.per_page, m.current_page, m.last_page].every((n) => typeof n === "number" && Number.isFinite(n));
}
function isRegistry(v: unknown): v is ApiPermissionRegistry {
  const r = v as ApiPermissionRegistry | null;
  return !!r && Array.isArray(r.groups) && r.groups.every((g) => typeof g.key === "string" && Array.isArray(g.permissions)) &&
    Array.isArray(r.reserved) && Array.isArray(r.protected) && Array.isArray(r.your_permissions);
}

/** Roles & Permissions. Rendered only for holders of a roles/permissions view or assign permission. */
export default async function AccessPage() {
  const session = await requireSession();
  const { t } = await getI18n();
  if (!session.ok) {
    if (session.reason === "no-token") redirect("/login");
    if (session.reason === "expired") return <ClearSession notice="expired" />;
    if (session.reason === "inactive") return <ClearSession notice="inactive" />;
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-6">
        <div className="w-full max-w-md">
          <Alert message={t("dashboard.serviceUnavailable")} />
        </div>
      </main>
    );
  }
  const caps = session.caps;
  if (!can(caps, "roles.view", "roles.assign", "permissions.view")) {
    return <RestrictedPage title={t("access.restricted.title")} body={t("access.restricted.body")} />;
  }

  const [rolesRes, registryRes, usersRes] = await Promise.all([
    can(caps, "roles.view") ? fetchAccess<{ data?: unknown }>(session.token, "/roles") : Promise.resolve(null),
    fetchAccess<{ data?: unknown }>(session.token, "/permissions"),
    can(caps, "roles.view", "roles.assign") ? fetchAccess<{ data?: unknown; meta?: unknown }>(session.token, "/users?per_page=25&page=1") : Promise.resolve(null),
  ]);
  const roles = rolesRes && rolesRes.ok && isRoleList(rolesRes.data?.data) ? rolesRes.data.data : null;
  const registry = registryRes.ok && isRegistry(registryRes.data?.data) ? registryRes.data.data : null;
  const users = usersRes && usersRes.ok && isUserList(usersRes.data?.data) ? usersRes.data.data : null;
  const usersMeta = usersRes && usersRes.ok && isMeta(usersRes.data?.meta) ? usersRes.data.meta : null;

  return (
    <AccessManager
      roles={roles}
      registry={registry}
      users={users}
      usersMeta={usersMeta}
      viewerIsSystemAdmin={caps.roles.some((r) => r.key === "system_super_admin")}
      can={{
        create: can(caps, "roles.create"),
        update: can(caps, "roles.update"),
        delete: can(caps, "roles.delete"),
        assign: can(caps, "roles.assign"),
        managePermissions: can(caps, "permissions.manage"),
      }}
    />
  );
}
