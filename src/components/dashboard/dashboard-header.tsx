import Link from "next/link";
import { Search, Bell, Plus } from "lucide-react";

import { formatDateTimeHeader } from "@/lib/format";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import type { Period } from "@/server/queries/dashboard";

function greeting(now: Date) {
  const hour = now.getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export function DashboardHeader({
  firstName,
  period,
  hasAlerts,
}: {
  firstName: string;
  period: Period;
  hasAlerts: boolean;
}) {
  const now = new Date();

  return (
    <header className="sticky top-0 z-[1] flex flex-wrap items-center gap-3.5 bg-bg/88 px-[clamp(18px,2.4vw,34px)] py-5 backdrop-blur-md">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[11.5px] font-medium uppercase tracking-[.06em] text-faint">
          {formatDateTimeHeader(now)}
        </span>
        <h1 className="m-0 text-[clamp(22px,2.2vw,27px)] font-semibold tracking-tight">
          {greeting(now)}, {firstName}
        </h1>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2.5">
        <Link
          href="/pedidos"
          className="flex min-w-[200px] items-center gap-2 rounded-[11px] border border-border-strong bg-surface px-3.5 py-2.5 text-faint transition-colors hover:border-accent hover:text-accent-hover"
        >
          <Search className="h-[15px] w-[15px]" />
          <span className="text-[13.5px]">Buscar pedido ou cliente</span>
        </Link>

        <PeriodSelector active={period} />

        <span
          className="relative grid h-10 w-10 place-items-center rounded-[11px] border border-border-strong bg-surface text-muted"
          aria-label={hasAlerts ? "Existem alertas pendentes" : "Sem alertas"}
        >
          <Bell className="h-[17px] w-[17px]" />
          {hasAlerts ? (
            <span className="absolute top-[9px] right-[10px] h-[7px] w-[7px] rounded-full border-2 border-surface bg-crit" />
          ) : null}
        </span>

        <Link
          href="/pedidos/novo"
          className="flex items-center gap-2 rounded-[11px] bg-charcoal px-4 py-[11px] text-[13.5px] font-medium text-white transition-colors hover:bg-accent-hover active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Novo pedido
        </Link>
      </div>
    </header>
  );
}
