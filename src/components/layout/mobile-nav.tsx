"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { NAV_ITEMS } from "@/lib/nav";
import { NavLinkContent } from "@/components/layout/nav-link-content";
import { MobileMoreSheet } from "@/components/layout/mobile-more-sheet";

// The 4 items used operationally the most — everything else lives behind
// "Mais". Mirrors the bottom-nav best practice of a handful of visible
// destinations instead of the previous 9-wide horizontally-scrolling strip
// (where several items were only reachable by dragging sideways).
const PRIMARY_HREFS = ["/dashboard", "/pedidos", "/cardapio", "/clientes"];

export function MobileNav({ badges = {} }: { badges?: Partial<Record<string, number>> }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const primaryItems = NAV_ITEMS.filter((item) => PRIMARY_HREFS.includes(item.href));
  const moreItems = NAV_ITEMS.filter((item) => !PRIMARY_HREFS.includes(item.href));
  const moreActive = moreItems.some((item) => pathname === item.href || pathname.startsWith(item.href + "/"));
  const moreBadgeTotal = moreItems.reduce((sum, item) => sum + (badges[item.href] ?? 0), 0);

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-10 flex items-stretch justify-around border-t border-border bg-white/97 px-1 pt-2 backdrop-blur md:hidden"
        style={{ paddingBottom: "max(0.5rem, var(--safe-bottom))" }}
      >
        {primaryItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          const badge = badges[item.href];
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-1 rounded-[14px] px-2 py-1.5 text-center transition-colors ${
                active ? "bg-accent-bg text-accent-hover" : "text-faint"
              }`}
            >
              <NavLinkContent className="flex flex-col items-center gap-1">
                <span className="relative">
                  <Icon className="h-[18px] w-[18px]" />
                  {badge ? (
                    <span className="absolute -right-2 -top-1.5 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-crit px-[3px] text-[9.5px] font-semibold text-white">
                      {badge}
                    </span>
                  ) : null}
                </span>
                <span className="whitespace-nowrap text-[10.5px] font-medium">{item.label}</span>
              </NavLinkContent>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={`flex flex-1 flex-col items-center gap-1 rounded-[14px] px-2 py-1.5 text-center transition-colors ${
            moreActive ? "bg-accent-bg text-accent-hover" : "text-faint"
          }`}
        >
          <span className="relative">
            <Menu className="h-[18px] w-[18px]" />
            {moreBadgeTotal ? (
              <span className="absolute -right-2 -top-1.5 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-crit px-[3px] text-[9.5px] font-semibold text-white">
                {moreBadgeTotal}
              </span>
            ) : null}
          </span>
          <span className="whitespace-nowrap text-[10.5px] font-medium">Mais</span>
        </button>
      </nav>

      <MobileMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} items={moreItems} badges={badges} pathname={pathname} />
    </>
  );
}
