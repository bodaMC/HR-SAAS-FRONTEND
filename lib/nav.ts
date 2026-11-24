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
 * Labels are translation keys into nav.sections / nav.items in the i18n
 * dictionaries; icons are named lucide-react imports (tree-shaken).
 */
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
  Settings,
  ShieldCheck,
  Timer,
  UserRound,
  UsersRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type NavStatus = "active" | "planned" | "roadmap";

export interface NavItem {
  /** Key into the dictionary's nav.items group. */
  labelKey: string;
  icon: LucideIcon;
  /** Route for active items; planned/roadmap items have no destination. */
  href?: string;
  status: NavStatus;
  /** When set, only these verified roles see the item (fail closed). */
  roles?: string[];
  /** Key into common badges: non-working entries are never links. */
  badgeKey: "soon" | "roadmap";
}

export interface NavSection {
  /** Key into the dictionary's nav.sections group. */
  labelKey: string;
  items: NavItem[];
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
      { labelKey: "employees", icon: UsersRound, status: "planned", badgeKey: "soon" },
      { labelKey: "departments", icon: Building2, status: "planned", badgeKey: "soon" },
      { labelKey: "jobTitles", icon: BriefcaseBusiness, status: "planned", badgeKey: "soon" },
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
    labelKey: "administration",
    items: [
      // Read access verified for all roles (GET work-schedule, holidays).
      { labelKey: "workSchedules", icon: CalendarClock, status: "planned", badgeKey: "soon" },
      { labelKey: "holidays", icon: Palmtree, status: "planned", badgeKey: "soon" },
      // No endpoints exist: roadmap entries implying no authorization.
      { labelKey: "companySettings", icon: Settings, status: "roadmap", badgeKey: "roadmap" },
      { labelKey: "approvalWorkflows", icon: Workflow, status: "roadmap", badgeKey: "roadmap" },
      // Audit policy: owner/admin only; hidden for every other role.
      { labelKey: "auditLogs", icon: ShieldCheck, status: "planned", badgeKey: "soon", roles: ["owner", "admin"] },
    ],
  },
];

// The backend UserRole enum is exactly these four values (verified in the
// backend review). Anything else is unrecognized and fails closed.
const KNOWN_ROLES: readonly string[] = ["owner", "admin", "manager", "employee"];

export function sectionsForRole(role: string): NavSection[] {
  if (!KNOWN_ROLES.includes(role)) return [];
  return NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.roles || i.roles.includes(role)),
  })).filter((s) => s.items.length > 0);
}

/** Dictionary key under roles.* for a backend role; unknown fails closed. */
export function roleLabelKey(role: string): string {
  return KNOWN_ROLES.includes(role) ? role : "unknown";
}
