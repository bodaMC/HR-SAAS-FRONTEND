"use client";

import { useEffect, useRef, useState } from "react";
import { LogoutButton } from "@/components/logout-button";
import { roleLabel } from "@/lib/nav";
import type { ApiUser } from "@/lib/types";

export function UserMenu({ user }: { user: ApiUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
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

  return (
    <div ref={ref} className="relative border-s border-border ps-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="User menu"
        className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-brand-accent"
      >
        <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-primary/15 text-xs font-bold text-brand-strong">
          {initials || "U"}
        </span>
        <span className="hidden text-start sm:block">
          <span className="block max-w-40 truncate text-sm font-semibold text-foreground">{user.name}</span>
          <span className="block text-xs text-foreground-muted">{roleLabel(user.role)}</span>
        </span>
        <svg viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 text-foreground-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">
          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div role="menu" data-testid="user-menu" className="absolute end-0 top-full z-50 mt-2 w-64 rounded-xl border border-border bg-surface p-2 shadow-lg">
          <div className="border-b border-border px-3 pb-2.5 pt-1.5">
            <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
            <p className="truncate text-xs text-foreground-muted">{user.email}</p>
            <span className="mt-1.5 inline-flex items-center rounded-full bg-brand-primary/10 px-2 py-0.5 text-[11px] font-semibold text-brand-strong">
              {roleLabel(user.role)}
            </span>
          </div>
          <div className="px-3 pb-1 pt-2" role="menuitem">
            <LogoutButton />
          </div>
        </div>
      )}
    </div>
  );
}
