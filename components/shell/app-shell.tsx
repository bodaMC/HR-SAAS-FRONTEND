"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/shell/user-menu";
import { sectionsForRole } from "@/lib/nav";
import { brand } from "@/lib/brand";
import type { ApiCompany, ApiUser } from "@/lib/types";

const COLLAPSE_KEY = "orbit-sidebar-collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

const ICON_PATHS: Record<string, string> = {
  home: "M10.7 3.27a.75.75 0 0 0-1.4 0l-6 6.5A.75.75 0 0 0 3.75 11H4v7.25c0 .414.336.75.75.75h3.5a.75.75 0 0 0 .75-.75V14h2v4.25c0 .414.336.75.75.75h3.5a.75.75 0 0 0 .75-.75V11h.25a.75.75 0 0 0 .55-1.23l-6-6.5Z",
  user: "M10 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-7 8.25A7.25 7.25 0 0 1 10 10a7.25 7.25 0 0 1 7 7.25.75.75 0 0 1-.75.75H3.75a.75.75 0 0 1-.75-.75Z",
  users: "M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8.5 7.5a5.5 5.5 0 0 0-11 0 .75.75 0 0 0 .75.75h9.5a.75.75 0 0 0 .75-.75Zm2-6.25a2.5 2.5 0 1 1-3.32-2.36A5.52 5.52 0 0 1 14.5 7a5.5 5.5 0 0 1 2.5.52c.33.5.5 1.1.5 1.73Z",
  building: "M4 3.25C4 2.56 4.56 2 5.25 2h6.5c.69 0 1.25.56 1.25 1.25V18h2.25a.75.75 0 0 1 0 1.5H4.75a.75.75 0 0 1 0-1.5H5.5V3.25ZM7 5.5v2h2v-2H7Zm0 3.5v2h2V9H7Zm3.5-3.5v2h2v-2h-2ZM7 12.5v2h2v-2H7Zm3.5 0v2h2v-2h-2Z",
  badge: "M10 2a2.5 2.5 0 0 0-2.5 2.5v.75h-1.25A2.25 2.25 0 0 0 4 7.5v9A2.25 2.25 0 0 0 6.25 18.75h7.5A2.25 2.25 0 0 0 16 16.5v-9a2.25 2.25 0 0 0-2.25-2.25h-1.25V4.5A2.5 2.5 0 0 0 10 2Zm-1.5 3a1 1 0 0 0-1 1v1h3v-1a1 1 0 0 0-1-1Z",
  folder: "M3.75 3A1.75 1.75 0 0 0 2 4.75v10.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0 0 18 15.25v-8.5A1.75 1.75 0 0 0 16.25 5H10l-.72-1.2A1.75 1.75 0 0 0 7.75 3h-4Z",
  calendar: "M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2ZM3.5 9v6.25c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25V9h-13Z",
  clock: "M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm.75 4a.75.75 0 0 0-1.5 0v4c0 .2.08.39.22.53l2.5 2.5a.75.75 0 0 0 1.06-1.06l-2.28-2.28V6Z",
  scale: "M10 2a.75.75 0 0 1 .75.75v1.25h3.5a.75.75 0 0 1 .3 1.44l1.7 4.53a.75.75 0 0 1-.05.6A3.49 3.49 0 0 1 13 12a3.49 3.49 0 0 1-3.2-2.43.75.75 0 0 1-.05-.6l1.7-4.53a.75.75 0 0 1 .3-.44h-1v9.25h2.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1 0-1.5h2.5V4H6.25a.75.75 0 0 1 .3.44l1.7 4.53a.75.75 0 0 1-.05.6A3.49 3.49 0 0 1 5 12a3.49 3.49 0 0 1-3.2-2.43.75.75 0 0 1-.05-.6l1.7-4.53a.75.75 0 0 1 .3-.44h3.5V2.75A.75.75 0 0 1 10 2Z",
  check: "M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm3.53 6.53-4 4.5a.75.75 0 0 1-1.09.03l-2-2a.75.75 0 1 1 1.06-1.06l1.44 1.44 3.47-3.9a.75.75 0 0 1 1.12.99Z",
  schedule: "M6 2.75A.75.75 0 0 1 6.75 2h6.5a.75.75 0 0 1 .75.75v.55a8 8 0 0 1 0 13.4v.55a.75.75 0 0 1-.75.75h-6.5a.75.75 0 0 1-.75-.75v-.55ZM10 6a.75.75 0 0 0-.75.75V10c0 .2.08.39.22.53l2 2a.75.75 0 0 0 1.06-1.06l-1.78-1.78V6.75A.75.75 0 0 0 10 6Z",
  sun: "M10 5.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9ZM10 1a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 1Zm9 9a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 19 10Zm-9 7.25a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V18a.75.75 0 0 1 .75-.75Zm-7.25-.75a.75.75 0 0 1 0-1.5h1.5a.75.75 0 0 1 0 1.5h-1.5ZM4.28 4.28a.75.75 0 0 1 1.06 0l1.06 1.06A.75.75 0 1 1 5.34 6.4L4.28 5.34a.75.75 0 0 1 0-1.06Zm11.32 11.32a.75.75 0 0 1 1.06 0l1.06 1.06a.75.75 0 1 1-1.06 1.06l-1.06-1.06a.75.75 0 0 1 0-1.06Zm1.06-11.32a.75.75 0 0 1 0 1.06l-1.06 1.06a.75.75 0 0 1-1.06-1.06l1.06-1.06a.75.75 0 0 1 0-1.06ZM5.34 13.6a.75.75 0 0 1 0 1.06l-1.06 1.06a.75.75 0 1 1-1.06-1.06l1.06-1.06a.75.75 0 0 1 1.06 0Z",
  cog: "M11.36 1.39a1.5 1.5 0 0 0-2.72 0l-.6 1.5c-.24.09-.47.2-.7.32l-1.5-.6a1.5 1.5 0 0 0-1.93.93l-.52 1.65c.05.26.05.52 0 .78l-1.57.56a1.5 1.5 0 0 0-.8 2.08l1 1.6c-.13.26-.13.55 0 .8l-1 1.61a1.5 1.5 0 0 0 .8 2.08l1.56.56c.05.26.05.52 0 .78l.52 1.65a1.5 1.5 0 0 0 1.93.93l1.5-.6c.23.12.46.23.7.32l.6 1.5a1.5 1.5 0 0 0 2.72 0l.6-1.5c.24-.09.47-.2.7-.32l1.5.6a1.5 1.5 0 0 0 1.93-.93l.52-1.65a1.5 1.5 0 0 1 0-.78l1.56-.56a1.5 1.5 0 0 0 .8-2.08l-1-1.6c.13-.26.13-.55 0-.8l1-1.61a1.5 1.5 0 0 0-.8-2.08l-1.56-.56a1.5 1.5 0 0 1 0-.78l-.52-1.65a1.5 1.5 0 0 0-1.93-.93l-1.5.6a1.47 1.47 0 0 1-.7-.32l-.6-1.5ZM10 7.25a2.75 2.75 0 1 1 0 5.5 2.75 2.75 0 0 1 0-5.5Z",
  flow: "M5 3.5A1.5 1.5 0 0 1 6.5 2h7A1.5 1.5 0 0 1 15 3.5v2a1.5 1.5 0 0 1-1.5 1.5h-1.75v3h2.75a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 6 17v-5a1.5 1.5 0 0 1 1.5-1.5h2.75V7H8.5A1.5 1.5 0 0 1 7 5.5v-2H5Z",
  list: "M3 5.75A.75.75 0 0 1 3.75 5h12.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 5.75Zm0 4.25a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 10Zm.75 3.5a.75.75 0 0 0 0 1.5h12.5a.75.75 0 0 0 0-1.5H3.75Z",
};

function NavIcon({ name, className }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className ?? "h-4 w-4"} aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d={ICON_PATHS[name] ?? ICON_PATHS.list} />
    </svg>
  );
}

function SidebarContent({
  role,
  collapsed,
  onNavigate,
}: {
  role: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {sectionsForRole(role).map((section) => (
        <div key={section.label}>
          {!collapsed && (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-white/50">
              {section.label}
            </p>
          )}
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active = item.href !== undefined && pathname === item.href;
              if (item.status !== "active" || !item.href) {
                const meaning =
                  item.status === "roadmap"
                    ? "Roadmap: planned architecture, no backend module yet"
                    : "Planned for a future phase";
                return (
                  <li key={item.label}>
                    <span
                      aria-disabled="true"
                      aria-label={collapsed ? `${item.label} (${item.badge})` : undefined}
                      title={`${item.label} - ${meaning}`}
                      className={`flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/45 ${collapsed ? "justify-center" : ""}`}
                    >
                      <NavIcon name={item.icon} />
                      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                      {!collapsed && (
                        <span className="rounded-full border border-white/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/45">
                          {item.badge}
                        </span>
                      )}
                    </span>
                  </li>
                );
              }
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    aria-label={collapsed ? item.label : undefined}
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "bg-white/10 text-white shadow-[inset_2px_0_0_0_var(--brand-accent)]"
                        : "text-white/75 hover:bg-white/5 hover:text-white"
                    } ${collapsed ? "justify-center" : ""}`}
                  >
                    <NavIcon name={item.icon} className={`h-4 w-4 ${active ? "text-brand-accent" : ""}`} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
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

export function AppShell({
  user,
  company,
  children,
}: {
  user: ApiUser;
  company: ApiCompany | null;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const openButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Defer so the client first paints the same markup as the server
    // (expanded), then applies the persisted collapse state.
    const id = requestAnimationFrame(() => {
      setCollapsed(readCollapsed());
      setMounted(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);

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
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        // storage unavailable; state still applies for this session
      }
      return !c;
    });
  }

  const companyName = company?.name ?? brand.companyName;

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Desktop sidebar */}
      <aside
        data-testid="sidebar"
        className={`fixed inset-y-0 start-0 z-30 hidden flex-col bg-[#10382a] text-white transition-[width] duration-200 lg:flex ${
          mounted && collapsed ? "w-16" : "w-64"
        }`}
      >
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-4">
          <div className="rounded-lg bg-white p-1.5">
            <BrandLogo className="h-6 w-auto" />
          </div>
          {!(mounted && collapsed) && (
            <div className="min-w-0">
              <p className="truncate text-sm font-bold tracking-tight">
                ORBIT<span className="text-brand-accent"> HR</span>
              </p>
              <p className="truncate text-[11px] text-white/55">{companyName}</p>
            </div>
          )}
        </div>
        <SidebarContent role={user.role} collapsed={mounted && collapsed} />
        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={mounted && collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={mounted && collapsed}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-brand-accent"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 transition-transform ${mounted && collapsed ? "rotate-180" : ""}`} aria-hidden="true">
              <path fillRule="evenodd" d="M12.78 15.28a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 0 1 0-1.06l4.5-4.5a.75.75 0 1 1 1.06 1.06L8.81 10.25l3.97 3.97a.75.75 0 0 1 0 1.06Z" clipRule="evenodd" />
            </svg>
            {!(mounted && collapsed) && <span>Collapse</span>}
          </button>
        </div>
      </aside>

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
            aria-label="Navigation"
            data-testid="mobile-drawer"
            className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col bg-[#10382a] text-white shadow-xl"
          >
            <div className="flex h-16 items-center gap-3 border-b border-white/10 px-4">
              <div className="rounded-lg bg-white p-1.5">
                <BrandLogo className="h-6 w-auto" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold tracking-tight">
                  ORBIT<span className="text-brand-accent"> HR</span>
                </p>
                <p className="truncate text-[11px] text-white/55">{companyName}</p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation"
                className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-brand-accent"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                  <path d="M5.28 5.28a.75.75 0 0 1 1.06 0L10 8.94l3.66-3.66a.75.75 0 1 1 1.06 1.06L11.06 10l3.66 3.66a.75.75 0 1 1-1.06 1.06L10 11.06l-3.66 3.66a.75.75 0 0 1-1.06-1.06L8.94 10 5.28 6.34a.75.75 0 0 1 0-1.06Z" />
                </svg>
              </button>
            </div>
            <SidebarContent role={user.role} collapsed={false} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      {/* Main column (inert while the mobile drawer is open) */}
      <div
        data-testid="app-main-column"
        className={`flex min-h-dvh flex-1 flex-col transition-[padding] duration-200 ${mounted && collapsed ? "lg:ps-16" : "lg:ps-64"}`}
      >
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface px-4 sm:px-6">
          <button
            type="button"
            ref={openButtonRef}
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            className="rounded-lg p-2 text-foreground-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand-strong lg:hidden"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
              <path fillRule="evenodd" d="M3 5.75A.75.75 0 0 1 3.75 5h12.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 5.75Zm0 4.25a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 10Zm0 4.25a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H3.75a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
            </svg>
          </button>
          <nav aria-label="Breadcrumb" className="hidden min-w-0 flex-1 overflow-hidden sm:block">
            <ol className="flex items-center gap-1.5 text-sm">
              <li className="text-foreground-muted">ORBIT HR</li>
              <li aria-hidden="true" className="text-foreground-muted">/</li>
              <li aria-current="page" className="truncate font-semibold text-foreground">
                {pathname === "/" ? "Dashboard" : pathname.split("/").filter(Boolean).pop()}
              </li>
            </ol>
          </nav>
          <ThemeToggle />
          <UserMenu user={user} />
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        <footer className="border-t border-border py-4">
          <p className="text-center text-xs text-foreground-muted">{brand.footerLine}</p>
        </footer>
      </div>
    </div>
  );
}
