"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ITEMS } from "@/lib/nav";
import { NavLinkContent } from "@/components/layout/nav-link-content";

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex gap-1 overflow-x-auto border-t border-border bg-white/97 px-2 py-2 backdrop-blur md:hidden">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-none rounded-[14px] px-3.5 py-1.5 text-center transition-colors ${
              active ? "bg-accent-bg text-accent-hover" : "text-faint"
            }`}
          >
            <NavLinkContent className="flex flex-col items-center gap-1">
              <Icon className="h-[18px] w-[18px]" />
              <span className="whitespace-nowrap text-[10.5px] font-medium">{item.label}</span>
            </NavLinkContent>
          </Link>
        );
      })}
    </nav>
  );
}
