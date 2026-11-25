"use client";

/**
 * The user zone at the bottom of the sidebar: avatar with initials, name
 * and localized role, acting as the profile menu trigger. The menu shows
 * the full identity (name, email, role badge) and sign-out. It opens
 * upward from the bottom zone and works in both expanded and collapsed
 * sidebar modes, with Escape / outside-click dismissal and focus return.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { roleLabelKey } from "@/lib/nav";
import { useI18n } from "@/lib/i18n/client";
import type { ApiUser } from "@/lib/types";
import type { Capabilities } from "@/lib/access";

export function UserMenu({ user, collapsed, caps }: { user: ApiUser; collapsed: boolean; caps: Capabilities }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  // Effective RBAC role(s) come from the server-verified access block. The legacy account
  // type (owner/admin/manager/employee) is a separate, labelled fact and never stands in for a role.
  const accessRoleText = caps.roles.length
    ? caps.roles.map((r) => (locale === "ar" && r.name_ar ? r.name_ar : r.name)).join(", ")
    : t("nav.noAccessRole");
  const accountTypeText = t(`roles.${roleLabelKey(user.role)}`);

  return (
    <div ref={ref} className="relative" data-testid="sidebar-user-zone">
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("nav.userMenu")}
        className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-start transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-brand-accent ${
          collapsed ? "justify-center px-0" : ""
        }`}
      >
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-accent/20 text-xs font-bold text-brand-accent"
        >
          {initials || "U"}
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-white">{user.name}</span>
              <span data-testid="user-access-role" className="block truncate text-xs text-white/55">{accessRoleText}</span>
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-white/55 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </>
        )}
      </button>
      {open && (
        <div
          role="menu"
          data-testid="user-menu"
          className="absolute bottom-full start-0 z-50 mb-2 w-64 rounded-xl border border-border bg-surface p-2 shadow-lg"
        >
          <div className="border-b border-border px-3 pb-2.5 pt-1.5">
            <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
            <p className="truncate text-xs text-foreground-muted" dir="ltr">
              {user.email || t("common.emailUnavailable")}
            </p>
            <p className="mt-2 text-[11px] text-foreground-muted">{t("nav.accessRole")}</p>
            <span data-testid="user-menu-access-role" className="mt-0.5 inline-flex max-w-full items-center rounded-full bg-brand-primary/10 px-2 py-0.5 text-[11px] font-semibold text-brand-strong">
              <span className="truncate">{accessRoleText}</span>
            </span>
            <p className="mt-2 text-[11px] text-foreground-muted">{t("nav.accountType")}</p>
            <p data-testid="user-menu-account-type" className="text-xs font-medium text-foreground">{accountTypeText}</p>
            {caps.isPlatformAdmin ? (
              <>
                <p className="mt-2 text-[11px] text-foreground-muted">{t("nav.adminIdentity")}</p>
                <p data-testid="user-menu-platform-identity" className="text-xs font-medium text-foreground">{t("nav.platformAdminIdentity")}</p>
              </>
            ) : null}
          </div>
          <div className="px-3 pb-1 pt-2" role="menuitem">
            <LogoutButton />
          </div>
        </div>
      )}
    </div>
  );
}
