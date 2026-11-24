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
 */

export type NavStatus = "active" | "planned" | "roadmap";

export interface NavItem {
  label: string;
  icon: string;
  /** Route for active items; planned/roadmap items have no destination. */
  href?: string;
  status: NavStatus;
  /** When set, only these verified roles see the item (fail closed). */
  roles?: string[];
  /** Badge text: non-working entries are never links. */
  badge?: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Workspace",
    items: [
      { label: "Dashboard", icon: "home", href: "/", status: "active" },
      { label: "My Profile", icon: "user", status: "planned", badge: "Soon" },
    ],
  },
  {
    label: "Organization",
    items: [
      { label: "Employees", icon: "users", status: "planned", badge: "Soon" },
      { label: "Departments", icon: "building", status: "planned", badge: "Soon" },
      { label: "Job Titles", icon: "badge", status: "planned", badge: "Soon" },
      { label: "Organization Structure", icon: "org", status: "roadmap", badge: "Roadmap" },
      { label: "Projects", icon: "folder", status: "planned", badge: "Soon" },
    ],
  },
  {
    label: "HR Management",
    items: [
      { label: "Leave Management", icon: "calendar", status: "planned", badge: "Soon" },
      { label: "Permissions", icon: "clock", status: "planned", badge: "Soon" },
      { label: "Compensatory Time", icon: "scale", status: "planned", badge: "Soon" },
      { label: "Approval Center", icon: "check", status: "roadmap", badge: "Roadmap" },
    ],
  },
  {
    label: "Administration",
    items: [
      // Read access verified for all roles (GET work-schedule, holidays).
      { label: "Work Schedules", icon: "schedule", status: "planned", badge: "Soon" },
      { label: "Holidays", icon: "sun", status: "planned", badge: "Soon" },
      // No endpoints exist: roadmap entries implying no authorization.
      { label: "Company Settings", icon: "cog", status: "roadmap", badge: "Roadmap" },
      { label: "Approval Workflows", icon: "flow", status: "roadmap", badge: "Roadmap" },
      // Audit policy: owner/admin only; hidden for every other role.
      { label: "Audit Logs", icon: "list", status: "planned", badge: "Soon", roles: ["owner", "admin"] },
    ],
  },
];

// The backend UserRole enum is exactly these four values (verified in the
// backend review). Anything else is unrecognized and fails closed.
const KNOWN_ROLES: readonly string[] = ["owner", "admin", "manager", "employee"];

export function sectionsForRole(role: string): NavSection[] {
  if (!KNOWN_ROLES.includes(role)) return [];
  return NAV_SECTIONS
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => !i.roles || i.roles.includes(role)),
    }))
    .filter((s) => s.items.length > 0);
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  employee: "Employee",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? "Unknown role";
}
