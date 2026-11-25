"use client";

/**
 * Application shell: fixed start-side sidebar (expanded 260px / collapsed
 * 80px, persisted in the existing orbit-sidebar-collapsed key), overlay
 * drawer below the lg breakpoint, sticky top bar, and content column.
 *
 * Phase 2.1 redesign:
 * - lucide-react icons at a consistent 20px / stroke width 2.
 * - 44px interactive targets, clear active/hover/focus/disabled states,
 *   subtle group separators, and a 4px inline-start active indicator.
 * - Collapsed mode shows centered icons with professional tooltips on
 *   hover and keyboard focus (fixed-positioned so the scrolling nav never
 *   clips them).
 * - Full RTL: every offset uses logical properties; directional icons
 *   mirror via rtl:-scale-x-100.
 * - All copy comes from the active locale dictionary; enum values and
 *   backend data are display-only.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { UserMenu } from "@/components/shell/user-menu";
import { sectionsForRole } from "@/lib/nav";
import { useI18n } from "@/lib/i18n/client";
import type { ApiCompany, ApiUser } from "@/lib/types";

// Existing storage key, kept unchanged for backward compatibility.
const COLLAPSE_KEY = "orbit-sidebar-collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

interface TooltipState {
  text: string;
  top: number;
  /** Offset from the leading viewport edge in the current direction. */
  edge: number;
}

function SidebarTooltip({ tooltip, dir }: { tooltip: TooltipState; dir: "ltr" | "rtl" }) {
  return (
    <span
      role="tooltip"
      aria-hidden="true"
      data-testid="sidebar-tooltip"
      className="pointer-events-none fixed z-50 max-w-56 -translate-y-1/2 rounded-lg bg-forest-deep px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-white shadow-lg ring-1 ring-white/10"
      style={{
        top: tooltip.top,
        ...(dir === "ltr" ? { left: tooltip.edge } : { right: tooltip.edge }),
      }}
    >
      {tooltip.text}
    </span>
  );
}

function SidebarContent({
  role,
  collapsed,
  onNavigate,
  showTooltip,
  hideTooltip,
}: {
  role: string;
  collapsed: boolean;
  onNavigate?: () => void;
  showTooltip: (e: React.SyntheticEvent<HTMLElement>, text: string) => void;
  hideTooltip: () => void;
}) {
  const { t } = useI18n();
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("nav.main")}
      className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4"
    >
      {sectionsForRole(role).map((section, sectionIndex) => (
        <div key={section.labelKey}>
          {sectionIndex > 0 && collapsed && (
            <hr className="mx-2 my-3 border-white/10" aria-hidden="true" />
          )}
          {!collapsed && (
            <p className="px-3 pt-3 pb-2 text-[11px] font-semibold uppercase tracking-widest text-brand-support/80 first:pt-0">
              {t(`nav.sections.${section.labelKey}`)}
            </p>
          )}
          <ul className="flex flex-col gap-1">
            {section.items.map((item) => {
              const label = t(`nav.items.${item.labelKey}`);
              const badge = t(item.badgeKey === "soon" ? "common.soon" : "common.roadmap");
              const Icon = item.icon;
              // Active on the section route itself and on every nested
              // route below it (new / [id] / [id]/edit), so the current
              // module stays highlighted while working inside it. The
              // dashboard ("/") stays exact-only, or it would match every
              // route.
              const active =
                item.href !== undefined &&
                (item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`));

              if (item.status !== "active" || !item.href) {
                const meaning = t(
                  item.status === "roadmap" ? "nav.roadmapMeaning" : "nav.plannedMeaning",
                );
                return (
                  <li key={item.labelKey}>
                    <span
                      aria-disabled="true"
                      aria-label={collapsed ? `${label} (${badge})` : undefined}
                      title={collapsed ? undefined : `${label} - ${meaning}`}
                      onMouseEnter={
                        collapsed ? (e) => showTooltip(e, `${label} · ${badge}`) : undefined
                      }
                      onMouseLeave={collapsed ? hideTooltip : undefined}
                      onFocus={collapsed ? (e) => showTooltip(e, `${label} · ${badge}`) : undefined}
                      onBlur={collapsed ? hideTooltip : undefined}
                      tabIndex={collapsed ? 0 : undefined}
                      className={`flex min-h-11 cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/40 ${
                        collapsed ? "justify-center px-0" : ""
                      }`}
                    >
                      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                      {!collapsed && <span className="min-w-0 flex-1 break-words leading-snug">{label}</span>}
                      {!collapsed && (
                        <span className="shrink-0 rounded-full border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-white/45 uppercase">
                          {badge}
                        </span>
                      )}
                    </span>
                  </li>
                );
              }

              return (
                <li key={item.labelKey}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    aria-label={collapsed ? label : undefined}
                    onMouseEnter={collapsed ? (e) => showTooltip(e, label) : undefined}
                    onMouseLeave={collapsed ? hideTooltip : undefined}
                    onFocus={collapsed ? (e) => showTooltip(e, label) : undefined}
                    onBlur={collapsed ? hideTooltip : undefined}
                    className={`relative flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-brand-accent ${
                      active
                        ? "bg-brand-accent/15 font-semibold text-white"
                        : "font-medium text-white/70 hover:bg-white/5 hover:text-white"
                    } ${collapsed ? "justify-center px-0" : ""}`}
                  >
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-2 start-0 w-1 rounded-full bg-brand-accent"
                      />
                    )}
                    <Icon
                      className={`h-5 w-5 shrink-0 ${active ? "text-brand-accent" : ""}`}
                      aria-hidden="true"
                    />
                    {!collapsed && <span className="min-w-0 break-words leading-snug">{label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

const BREADCRUMB_KEYS: Record<string, string> = {
  employees: "nav.items.employees",
  departments: "nav.items.departments",
  "job-titles": "nav.items.jobTitles",
  new: "breadcrumb.new",
  edit: "breadcrumb.edit",
};

function breadcrumbCrumbs(pathname: string, t: (key: string) => string): string[] {
  if (pathname === "/") return [t("nav.items.dashboard")];
  const crumbs: string[] = [];
  const segments = pathname.split("/").filter(Boolean);
  segments.forEach((seg, i) => {
    if (/^\d+$/.test(seg)) {
      if (i === segments.length - 1) crumbs.push(t("breadcrumb.details"));
      return;
    }
    const key = BREADCRUMB_KEYS[seg];
    crumbs.push(key ? t(key) : seg);
  });
  return crumbs.length > 0 ? crumbs : [t("nav.items.dashboard")];
}

function SidebarBrand({
  collapsed,
  tenantName,
}: {
  collapsed: boolean;
  tenantName: string | null;
}) {
  const { t } = useI18n();
  return (
    <div
      className={`flex h-[72px] items-center gap-3 border-b border-white/10 ${
        collapsed ? "justify-center px-2" : "px-4"
      }`}
    >
      <div className="shrink-0 rounded-lg bg-white p-1.5 shadow-sm">
        <BrandLogo alt={t("brand.logoAlt")} className={collapsed ? "h-7 w-auto" : "h-8 w-auto"} />
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold tracking-tight text-white">
            {t("brand.companyName")}
          </p>
          <p className="truncate text-[11px] font-medium text-white/70">{t("brand.productName")}</p>
          {tenantName ? (
            <p className="truncate text-[10px] font-medium text-white/50">{tenantName}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function AppShell({
  user,
  company,
  children,
}: {
  user: ApiUser;
  company: ApiCompany | null;
  children: React.ReactNode;
}) {
  const { t, dir } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const pathname = usePathname();
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Defer so the client first paints the same markup as the server
    // (expanded), then applies the persisted collapse state.
    const id = requestAnimationFrame(() => {
      setCollapsed(readCollapsed());
      setMounted(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const effectiveCollapsed = mounted && collapsed;

  // Drawer: while open, the background is inert (no focus, no pointer),
  // Tab/Shift+Tab cycle inside the drawer, Escape closes it, focus moves
  // into it on open and returns to the trigger on close, and background
  // scroll is locked.
  useEffect(() => {
    if (!drawerOpen) return;
    const drawer = document.querySelector<HTMLElement>('[data-testid="mobile-drawer"]');
    const main = document.querySelector<HTMLElement>('[data-testid="app-main-column"]');
    const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setDrawerOpen(false);
        return;
      }
      if (e.key !== "Tab" || !drawer) return;
      const focusables = Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !drawer.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !drawer.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (main) {
      main.setAttribute("inert", "");
      main.setAttribute("aria-hidden", "true");
    }
    const focusTarget = drawer?.querySelector<HTMLElement>(FOCUSABLE);
    focusTarget?.focus();
    const trigger = openButtonRef.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (main) {
        main.removeAttribute("inert");
        main.removeAttribute("aria-hidden");
      }
      trigger?.focus();
    };
  }, [drawerOpen]);

  function toggleCollapsed() {
    setTooltip(null);
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        // storage unavailable; state still applies for this session
      }
      return !c;
    });
  }

  const showTooltip = useCallback(
    (e: React.SyntheticEvent<HTMLElement>, text: string) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const gap = 10;
      // Anchor to the sidebar's own outer edge (not the trigger rect) so the
      // tooltip always opens fully into the content area, never overlapping.
      const sb = sidebarRef.current?.getBoundingClientRect();
      const edge =
        dir === "ltr"
          ? (sb?.right ?? rect.right) + gap
          : window.innerWidth - (sb?.left ?? rect.left) + gap;
      setTooltip({ text, top: rect.top + rect.height / 2, edge });
    },
    [dir],
  );
  const hideTooltip = useCallback(() => setTooltip(null), []);


  return (
    <div className="flex min-h-dvh bg-background">
      {/* Desktop sidebar */}
      <aside
        ref={sidebarRef}
        data-testid="sidebar"
        className={`fixed inset-y-0 start-0 z-30 hidden flex-col bg-forest text-white transition-[width] duration-200 motion-reduce:transition-none lg:flex ${
          effectiveCollapsed ? "w-20" : "w-[260px]"
        }`}
      >
        <SidebarBrand collapsed={effectiveCollapsed} tenantName={company?.name ?? null} />
        <SidebarContent
          role={user.role}
          collapsed={effectiveCollapsed}
          showTooltip={showTooltip}
          hideTooltip={hideTooltip}
        />
        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            onClick={toggleCollapsed}
            data-testid="collapse-toggle"
            aria-label={effectiveCollapsed ? t("nav.expand") : t("nav.collapse")}
            aria-pressed={effectiveCollapsed}
            className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-brand-accent ${
              effectiveCollapsed ? "justify-center px-0" : ""
            }`}
          >
            {effectiveCollapsed ? (
              <PanelLeftOpen className="h-5 w-5 shrink-0 rtl:-scale-x-100" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="h-5 w-5 shrink-0 rtl:-scale-x-100" aria-hidden="true" />
            )}
            {!effectiveCollapsed && <span>{t("nav.collapse")}</span>}
          </button>
        </div>
        <div className="border-t border-white/10 p-3">
          <UserMenu user={user} collapsed={effectiveCollapsed} />
        </div>
      </aside>
      {effectiveCollapsed && tooltip && <SidebarTooltip tooltip={tooltip} dir={dir} />}

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("nav.main")}
            data-testid="mobile-drawer"
            className="drawer-panel absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col bg-forest text-white shadow-xl"
          >
            <div className="flex h-[72px] items-center gap-3 border-b border-white/10 px-4">
              <div className="shrink-0 rounded-lg bg-white p-1.5 shadow-sm">
                <BrandLogo alt={t("brand.logoAlt")} className="h-8 w-auto" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold tracking-tight text-white">
                  {t("brand.companyName")}
                </p>
                <p className="truncate text-[11px] font-medium text-white/70">{t("brand.productName")}</p>
                {company?.name ? (
                  <p className="truncate text-[10px] font-medium text-white/50">{company.name}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label={t("nav.close")}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-brand-accent"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <SidebarContent
              role={user.role}
              collapsed={false}
              onNavigate={() => setDrawerOpen(false)}
              showTooltip={showTooltip}
              hideTooltip={hideTooltip}
            />
            <div className="border-t border-white/10 p-3">
              <UserMenu user={user} collapsed={false} />
            </div>
          </div>
        </div>
      )}

      {/* Main column (inert while the mobile drawer is open) */}
      <div
        data-testid="app-main-column"
        className={`flex min-h-dvh min-w-0 flex-1 flex-col transition-[padding] duration-200 motion-reduce:transition-none ${
          effectiveCollapsed ? "lg:ps-20" : "lg:ps-[260px]"
        }`}
      >
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface px-4 sm:px-6">
          <button
            type="button"
            ref={openButtonRef}
            onClick={() => setDrawerOpen(true)}
            aria-label={t("nav.open")}
            aria-expanded={drawerOpen}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-foreground-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand-strong lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="min-w-0 max-[420px]:hidden sm:hidden">
            <p className="truncate text-sm font-extrabold tracking-tight text-foreground">{t("brand.companyName")}</p>
            <p className="truncate text-xs text-foreground-muted">{t("brand.productName")}</p>
          </div>
          <nav aria-label="Breadcrumb" className="hidden min-w-0 flex-1 overflow-hidden sm:block">
            <ol className="flex items-center gap-1.5 text-sm">
              <li className="text-foreground-muted">{t("brand.productName")}</li>
              <li aria-hidden="true" className="text-foreground-muted">
                <ChevronRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
              </li>
              {breadcrumbCrumbs(pathname, t).map((crumb, i, arr) => (
                <li
                  key={`${crumb}-${i}`}
                  aria-current={i === arr.length - 1 ? "page" : undefined}
                  className={`flex items-center gap-1.5 ${i === arr.length - 1 ? "truncate font-semibold text-foreground" : "text-foreground-muted"}`}
                >
                  {i > 0 ? (
                    <ChevronRight className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />
                  ) : null}
                  <span className="truncate">{crumb}</span>
                </li>
              ))}
            </ol>
          </nav>
          <div className="ms-auto flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        <footer className="border-t border-border py-4">
          <p className="text-center text-xs text-foreground-muted">{t("brand.footerLine")}</p>
        </footer>
      </div>
    </div>
  );
}
