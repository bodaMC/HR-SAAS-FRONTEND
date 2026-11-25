/**
 * Navigation architecture for the application shell.
 *
 * Every item is declared with its availability, grounded in the backend
 * API review (see the Phase 2 API Integration Matrix):
 * - "planned": a module page deferred to a later phase whose READ access
 *   is verified for the roles listed (or all roles when roles is unset).
 *   Rendered as a clearly badged, non-interactive entry, never a link.
 * - "roadmap": no backend endpoint exists; architecture-only entry from
 *   the user's proposed structure. Implies no authorization for anyone.
 * - Per-item "roles" limits visibility to roles whose access is verified
 *   in backend policies. Unknown roles fail closed entirely: a role not in
 *   the backend's verified UserRole set sees NO navigation at all.
 *
 * Authorization is never inferred from section grouping; Laravel remains
 * the final authority on every endpoint call.
 *
 * Phase 3.2: visibility and state derive from the server-verified permissions
 * (see lib/access.ts). Items resolve to ENABLED / RESTRICTED / SOON / ROADMAP,
 * or are HIDDEN, which means they are removed from the result entirely and
 * therefore absent from the DOM. A section with no visible items disappears.
 *
 * Labels are translation keys into nav.sections / nav.items in the i18n
 * dictionaries; icons are named lucide-react imports (tree-shaken).
 */
import { can, type Capabilities } from "@/lib/access";
import {
  Building2,
  BriefcaseBusiness,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  FolderKanban,
  LayoutDashboard,
  Network,
  Palmtree,
  KeyRound,
  Settings,
  ShieldCheck,
  Timer,
  UserRound,
  UsersRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type NavStatus = "active" | "planned" | "roadmap";
/** Resolved render state. HIDDEN never appears: hidden items are removed. */
export type NavState = "enabled" | "restricted" | "soon" | "roadmap";

export interface NavItem {
  /** Key into the dictionary's nav.items group. */
  labelKey: string;
  icon: LucideIcon;
  /** Route for active items; planned/roadmap items have no destination. */
  href?: string;
  status: NavStatus;
  /** Permissions of which holding ANY unlocks the item. */
  needs?: string[];
  /** When the permission is missing: true = show locked (RESTRICTED), false/unset = HIDDEN. */
  lockedWithout?: boolean;
  /** Visible only to platform administrators. */
  platformOnly?: boolean;
  /** Key into common badges: non-working entries are never links. */
  badgeKey: "soon" | "roadmap";
}

export interface NavSection {
  /** Key into the dictionary's nav.sections group. */
  labelKey: string;
  items: NavItem[];
}

export interface ResolvedNavItem extends NavItem {
  state: NavState;
}
export interface ResolvedNavSection {
  labelKey: string;
  items: ResolvedNavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    labelKey: "workspace",
    items: [
      { labelKey: "dashboard", icon: LayoutDashboard, href: "/", status: "active", badgeKey: "soon" },
      { labelKey: "myProfile", icon: UserRound, status: "planned", badgeKey: "soon" },
    ],
  },
  {
    labelKey: "organization",
    items: [
      { labelKey: "employees", icon: UsersRound, href: "/employees", status: "active", needs: ["employees.view"], lockedWithout: true, badgeKey: "soon" },
      { labelKey: "departments", icon: Building2, href: "/departments", status: "active", needs: ["departments.view"], lockedWithout: true, badgeKey: "soon" },
      { labelKey: "jobTitles", icon: BriefcaseBusiness, href: "/job-titles", status: "active", needs: ["job_titles.view"], lockedWithout: true, badgeKey: "soon" },
      { labelKey: "orgStructure", icon: Network, status: "roadmap", badgeKey: "roadmap" },
      { labelKey: "projects", icon: FolderKanban, status: "planned", badgeKey: "soon" },
    ],
  },
  {
    labelKey: "hrManagement",
    items: [
      { labelKey: "leaveManagement", icon: CalendarDays, status: "planned", badgeKey: "soon" },
      { labelKey: "permissions", icon: Clock3, status: "planned", badgeKey: "soon" },
      { labelKey: "compensatoryTime", icon: Timer, status: "planned", badgeKey: "soon" },
      { labelKey: "approvalCenter", icon: ClipboardCheck, status: "roadmap", badgeKey: "roadmap" },
    ],
  },
  {
    // The whole section is HIDDEN unless at least one item is visible.
    labelKey: "administration",
    items: [
      { labelKey: "rolesPermissions", icon: KeyRound, href: "/access", status: "active", needs: ["roles.view", "roles.assign", "permissions.view"], badgeKey: "soon" },
      { labelKey: "workSchedules", icon: CalendarClock, status: "planned", needs: ["work_schedules.manage"], badgeKey: "soon" },
      { labelKey: "holidays", icon: Palmtree, status: "planned", needs: ["work_schedules.manage"], badgeKey: "soon" },
      { labelKey: "companySettings", icon: Settings, status: "roadmap", needs: ["company_settings.manage"], badgeKey: "roadmap" },
      { labelKey: "approvalWorkflows", icon: Workflow, status: "roadmap", needs: ["company_settings.manage"], badgeKey: "roadmap" },
      { labelKey: "auditLogs", icon: ShieldCheck, status: "planned", needs: ["audit_logs.view"], badgeKey: "soon" },
      // Platform support is explicit-tenant-context only and not built yet.
      { labelKey: "platformSupport", icon: ShieldCheck, status: "roadmap", platformOnly: true, badgeKey: "roadmap" },
    ],
  },
];

// The backend UserRole enum is exactly these four values (verified in the
// backend review). Anything else is unrecognized and fails closed.
const KNOWN_ROLES: readonly string[] = ["owner", "admin", "manager", "employee"];

export function navForUser(role: string, caps: Capabilities): ResolvedNavSection[] {
  if (!KNOWN_ROLES.includes(role) && !caps.isPlatformAdmin) return [];
  const out: ResolvedNavSection[] = [];
  for (const s of NAV_SECTIONS) {
    const items: ResolvedNavItem[] = [];
    for (const i of s.items) {
      if (i.platformOnly && !caps.isPlatformAdmin) continue;
      const allowed = !i.needs || can(caps, ...i.needs);
      if (!allowed && !i.lockedWithout) continue; // HIDDEN
      const state: NavState = !allowed
        ? "restricted"
        : i.status === "active"
          ? "enabled"
          : i.status === "planned"
            ? "soon"
            : "roadmap";
      items.push({ ...i, state });
    }
    if (items.length > 0) out.push({ labelKey: s.labelKey, items });
  }
  return out;
}

/** Dictionary key under roles.* for a backend role; unknown fails closed. */
export function roleLabelKey(role: string): string {
  return KNOWN_ROLES.includes(role) ? role : "unknown";
}
