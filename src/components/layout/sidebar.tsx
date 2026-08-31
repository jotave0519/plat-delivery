"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UtensilsCrossed, Monitor, LogOut } from "lucide-react";

import { NAV_ITEMS } from "@/lib/nav";
import { logoutAction } from "@/server/actions/auth";

type SidebarProps = {
  restaurantName: string;
  userName: string;
  userRoleLabel: string;
  badges: Partial<Record<string, number>>;
};

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function Sidebar({ restaurantName, userName, userRoleLabel, badges }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen flex-col gap-6 border-r border-border bg-surface px-2 py-5 md:flex md:w-[68px] lg:w-[226px]">
      <div className="flex items-center gap-2.5 px-2">
        <div className="grid h-8 w-8 flex-none place-items-center rounded-[10px] bg-charcoal">
          <UtensilsCrossed className="h-[17px] w-[17px]" style={{ color: "#4FC3CE" }} />
        </div>
        <div className="hidden min-w-0 flex-col leading-tight lg:flex">
          <span className="truncate text-[15.5px] font-semibold tracking-tight">Balcão</span>
          <span className="truncate text-[11px] text-faint">{restaurantName}</span>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          const badge = badges[item.href];
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`flex items-center gap-2.5 rounded-[11px] px-2.5 py-2.5 text-[14px] font-medium transition-colors ${
                active ? "bg-neutral-bg text-ink" : "text-muted hover:bg-neutral-bg"
              }`}
            >
              <Icon className="h-[17px] w-[17px] flex-none" />
              <span className="hidden truncate lg:inline">{item.label}</span>
              {badge ? (
                <span className="ml-auto hidden rounded-[7px] bg-accent-bg px-[7px] py-px text-[11.5px] font-semibold text-accent-hover lg:inline">
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2">
        <div className="hidden items-center gap-2 px-2.5 py-2 text-muted lg:flex">
          <Monitor className="h-[15px] w-[15px]" />
          <span className="text-[12px]">Balcão v0.1 · fundação</span>
        </div>
        <div className="flex items-center gap-2.5 px-2 py-1">
          <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-full bg-accent-bg text-[12px] font-semibold text-accent-hover">
            {initialsOf(userName)}
          </span>
          <div className="hidden min-w-0 flex-col leading-tight lg:flex">
            <span className="truncate text-[13px] font-medium">{userName}</span>
            <span className="truncate text-[11.5px] text-faint">{userRoleLabel}</span>
          </div>
          <form action={logoutAction} className="ml-auto hidden lg:block">
            <button type="submit" title="Sair" className="grid h-7 w-7 place-items-center rounded-[8px] text-faint transition-colors hover:bg-neutral-bg hover:text-crit">
              <LogOut className="h-[15px] w-[15px]" />
            </button>
          </form>
        </div>
        <form action={logoutAction} className="lg:hidden">
          <button type="submit" title="Sair" className="flex w-full items-center justify-center gap-2 rounded-[8px] py-1.5 text-faint transition-colors hover:bg-neutral-bg hover:text-crit">
            <LogOut className="h-[15px] w-[15px]" />
          </button>
        </form>
      </div>
    </aside>
  );
}
