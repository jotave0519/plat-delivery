"use client";

import { useEffect } from "react";
import Link from "next/link";
import { X } from "lucide-react";

import type { NavItem } from "@/lib/nav";
import { NavLinkContent } from "@/components/layout/nav-link-content";

/**
 * Slide-up panel for the mobile bottom nav's "Mais" button — holds whatever
 * items don't fit in the curated 4-item primary row (bottom-nav-limit: max
 * ~5 visible items, not the current 9-wide horizontally-scrolling strip).
 * Closes on backdrop tap, Esc, or picking an item — same escape routes as
 * any other overlay in the app.
 */
export function MobileMoreSheet({
  open,
  onClose,
  items,
  badges,
  pathname,
}: {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  badges: Partial<Record<string, number>>;
  pathname: string;
}) {
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-20 md:hidden">
      <button type="button" aria-label="Fechar menu" onClick={onClose} className="animate-unfold absolute inset-0 bg-ink/30" />
      <div
        data-testid="mobile-more-sheet"
        className="animate-rise-in absolute inset-x-0 bottom-0 flex flex-col gap-1 rounded-t-[22px] border-t border-border bg-surface px-3 pt-3 shadow-[0_-14px_30px_-14px_rgba(26,29,35,.25)]"
        style={{ paddingBottom: "max(1rem, var(--safe-bottom))" }}
      >
        <div className="flex items-center justify-between px-1.5 pb-1">
          <span className="text-[13px] font-semibold text-muted">Mais opções</span>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-[9px] text-faint transition-colors hover:bg-neutral-bg hover:text-ink"
          >
            <X className="h-[16px] w-[16px]" />
          </button>
        </div>
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          const badge = badges[item.href];
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`flex items-center rounded-[13px] px-3 py-3 text-[14px] font-medium transition-colors ${
                active ? "bg-neutral-bg text-ink" : "text-muted"
              }`}
            >
              <NavLinkContent className="flex flex-1 items-center gap-3">
                <Icon className="h-[18px] w-[18px] flex-none" />
                <span className="flex-1 truncate">{item.label}</span>
                {badge ? (
                  <span className="rounded-[7px] bg-accent-bg px-[7px] py-px text-[11.5px] font-semibold text-accent-hover">{badge}</span>
                ) : null}
              </NavLinkContent>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
