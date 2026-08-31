import { getTenant } from "@/lib/tenant";
import { getFinanceiroData, type FinanceiroPeriod } from "@/server/queries/financeiro";
import { formatBRL } from "@/lib/format";
import { PeriodFilter } from "@/components/financeiro/period-filter";
import { FinancialEntryForm } from "@/components/financeiro/financial-entry-form";
import { FinancialEntryRow } from "@/components/financeiro/financial-entry-row";

const VALID_PERIODS: FinanceiroPeriod[] = ["hoje", "7dias", "30dias", "personalizado"];

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function FinanceiroPage(props: PageProps<"/financeiro">) {
  const searchParams = await props.searchParams;
  const tenant = await getTenant();

  const periodParam = Array.isArray(searchParams.period) ? searchParams.period[0] : searchParams.period;
  const period: FinanceiroPeriod = VALID_PERIODS.includes(periodParam as FinanceiroPeriod)
    ? (periodParam as FinanceiroPeriod)
    : "hoje";

  const now = new Date();
  const defaultFrom = toDateInputValue(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
  const defaultTo = toDateInputValue(now);
  const fromParam = Array.isArray(searchParams.from) ? searchParams.from[0] : searchParams.from;
  const toParam = Array.isArray(searchParams.to) ? searchParams.to[0] : searchParams.to;
  const from = fromParam ?? defaultFrom;
  const to = toParam ?? defaultTo;

  const data = await getFinanceiroData(tenant.restaurantId, period, from, to);

  return (
    <div className="flex flex-col gap-5 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] font-semibold tracking-tight">Financeiro</h1>
        <p className="text-[13px] text-faint">Faturamento, despesas e recebimentos do período.</p>
      </div>

      <PeriodFilter period={period} from={from} to={to} />

      <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex flex-col gap-1.5 rounded-[16px] border border-border bg-surface p-4">
          <span className="text-[11px] font-medium uppercase tracking-[.05em] text-faint">Faturamento</span>
          <span className="text-[19px] font-semibold tracking-tight">{formatBRL(data.faturamento)}</span>
        </div>
        <div className="flex flex-col gap-1.5 rounded-[16px] border border-border bg-surface p-4">
          <span className="text-[11px] font-medium uppercase tracking-[.05em] text-faint">Despesas</span>
          <span className="text-[19px] font-semibold tracking-tight text-crit-fg">{formatBRL(data.despesasTotal)}</span>
        </div>
        <div className="flex flex-col gap-1.5 rounded-[16px] border border-border bg-surface p-4">
          <span className="text-[11px] font-medium uppercase tracking-[.05em] text-faint">Resultado</span>
          <span className={`text-[19px] font-semibold tracking-tight ${data.resultado >= 0 ? "text-ok-fg" : "text-crit-fg"}`}>
            {formatBRL(data.resultado)}
          </span>
        </div>
        <div className="flex flex-col gap-1.5 rounded-[16px] border border-border bg-surface p-4">
          <span className="text-[11px] font-medium uppercase tracking-[.05em] text-faint">Ticket médio</span>
          <span className="text-[19px] font-semibold tracking-tight">{formatBRL(data.ticketMedio)}</span>
        </div>
        <div className="flex flex-col gap-1.5 rounded-[16px] border border-border bg-surface p-4">
          <span className="text-[11px] font-medium uppercase tracking-[.05em] text-faint">A receber</span>
          <span className="text-[19px] font-semibold tracking-tight text-warn-fg">{formatBRL(data.aReceber)}</span>
        </div>
      </section>

      <section className="flex flex-col gap-3.5 rounded-[20px] border border-border bg-surface p-5">
        <h2 className="text-[15px] font-semibold tracking-tight">Recebimentos por forma de pagamento</h2>
        {data.recebimentos.length === 0 ? (
          <p className="text-[13px] text-faint">Nenhum recebimento no período.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {data.recebimentos.map((r) => (
              <div key={r.name} className="flex flex-col gap-1.5">
                <div className="flex items-baseline gap-2.5">
                  <span className="text-[13.5px] text-[#3D4351]">{r.name}</span>
                  <span className="ml-auto text-[14px] font-semibold">{formatBRL(r.amount)}</span>
                  <span className="w-10 text-right text-[11.5px] text-faint">{r.pct}</span>
                </div>
                <div className="h-[5px] overflow-hidden rounded-[4px] bg-neutral-bg">
                  <div className="h-full rounded-[4px] bg-charcoal" style={{ width: r.pct }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3.5 rounded-[20px] border border-border bg-surface p-5">
        <h2 className="text-[15px] font-semibold tracking-tight">Lançamentos manuais</h2>
        <div className="rounded-[13px] border border-dashed border-border-strong p-3.5">
          <FinancialEntryForm />
        </div>
        {data.entries.length === 0 ? (
          <p className="text-[13px] text-faint">Nenhum lançamento manual no período.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border-soft">
            {data.entries.map((entry) => (
              <FinancialEntryRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
