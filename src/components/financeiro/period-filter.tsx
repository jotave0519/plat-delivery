import Link from "next/link";

import type { FinanceiroPeriod } from "@/server/queries/financeiro";

const PERIODS: { value: FinanceiroPeriod; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "7dias", label: "7 dias" },
  { value: "30dias", label: "30 dias" },
  { value: "personalizado", label: "Personalizado" },
];

export function PeriodFilter({ period, from, to }: { period: FinanceiroPeriod; from: string; to: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex w-fit rounded-[11px] border border-border-strong bg-surface p-[3px]">
        {PERIODS.map((p) => (
          <Link
            key={p.value}
            href={`/financeiro?period=${p.value}`}
            className={`rounded-[8px] px-[13px] py-[7px] text-[13px] font-medium transition-colors ${
              period === p.value ? "bg-charcoal text-white" : "text-muted hover:text-ink"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {period === "personalizado" ? (
        <form action="/financeiro" method="GET" className="flex flex-wrap items-end gap-2.5">
          <input type="hidden" name="period" value="personalizado" />
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-muted">De</span>
            <input
              type="date"
              name="from"
              defaultValue={from}
              required
              className="rounded-[9px] border border-border-strong bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-muted">Até</span>
            <input
              type="date"
              name="to"
              defaultValue={to}
              required
              className="rounded-[9px] border border-border-strong bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent"
            />
          </label>
          <button
            type="submit"
            className="rounded-[9px] bg-charcoal px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Aplicar
          </button>
        </form>
      ) : null}
    </div>
  );
}
