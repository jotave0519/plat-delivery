import { TrendingUp, TrendingDown } from "lucide-react";

import { formatBRL } from "@/lib/format";
import type { DashboardData } from "@/server/queries/dashboard";

export function KpiSection({ kpi, periodLabel }: { kpi: DashboardData["kpi"]; periodLabel: string }) {
  return (
    <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
      <div className="flex flex-col gap-3.5 rounded-[20px] bg-charcoal p-[clamp(20px,1.8vw,26px)] text-white shadow-[0_20px_44px_-34px_rgba(20,22,27,.6)] sm:col-span-2">
        <span className="text-[11.5px] font-medium uppercase tracking-[.08em] text-[#8E95A6]">
          Faturamento · {periodLabel.toLowerCase()}
        </span>
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="whitespace-nowrap text-[clamp(34px,3.4vw,46px)] font-semibold leading-none tracking-tight">
            {formatBRL(kpi.faturamento)}
          </span>
          <span
            className={`flex items-center gap-1 rounded-[8px] px-[9px] py-1 text-[12.5px] font-medium ${
              kpi.faturamentoDelta.positive ? "bg-[rgba(111,211,182,.12)] text-[#6FD3B6]" : "bg-[rgba(198,67,48,.16)] text-[#F0A594]"
            }`}
          >
            {kpi.faturamentoDelta.positive ? <TrendingUp className="h-[14px] w-[14px]" /> : <TrendingDown className="h-[14px] w-[14px]" />}
            {kpi.faturamentoDelta.label}
          </span>
        </div>
        <span className="text-[12.5px] text-[#8E95A6]">vs. o período anterior equivalente</span>
      </div>

      <div className="flex flex-col gap-2 rounded-[20px] border border-border bg-surface px-[22px] py-5 shadow-[0_1px_2px_rgba(26,29,35,.04)]">
        <span className="text-[11.5px] font-medium uppercase tracking-[.08em] text-faint">Pedidos</span>
        <span className="text-[30px] font-semibold leading-none tracking-tight">{kpi.pedidos}</span>
        <span className="text-[12.5px] text-muted">{kpi.pedidosSub}</span>
      </div>

      <div className="flex flex-col gap-2 rounded-[20px] border border-border bg-surface px-[22px] py-5 shadow-[0_1px_2px_rgba(26,29,35,.04)]">
        <span className="text-[11.5px] font-medium uppercase tracking-[.08em] text-faint">Ticket médio</span>
        <span className="text-[30px] font-semibold leading-none tracking-tight">{formatBRL(kpi.ticketMedio)}</span>
        <span className="text-[12.5px] text-muted">{kpi.ticketMedioDelta.label} vs. período anterior</span>
      </div>
    </section>
  );
}
