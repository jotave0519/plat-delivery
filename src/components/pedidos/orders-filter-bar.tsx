"use client";

import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { FLOW } from "@/lib/order-flow";
import type { OrderStatus } from "@/generated/prisma";

const STATUS_TABS: { value: OrderStatus | "TODOS"; label: string }[] = [
  { value: "TODOS", label: "Todos" },
  { value: "NOVO", label: FLOW.NOVO.chip },
  { value: "AGUARDANDO_PAGAMENTO", label: FLOW.AGUARDANDO_PAGAMENTO.chip },
  { value: "CONFIRMADO", label: FLOW.CONFIRMADO.chip },
  { value: "EM_PREPARO", label: FLOW.EM_PREPARO.chip },
  { value: "PRONTO", label: FLOW.PRONTO.chip },
  { value: "EM_ENTREGA", label: FLOW.EM_ENTREGA.chip },
  { value: "CONCLUIDO", label: FLOW.CONCLUIDO.chip },
  { value: "CANCELADO", label: FLOW.CANCELADO.chip },
];

const PERIODS: { value: string; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "7dias", label: "7 dias" },
  { value: "30dias", label: "30 dias" },
  { value: "todos", label: "Todos" },
];

function buildHref(base: { status: string; period: string; q?: string }, overrides: Partial<typeof base>) {
  const merged = { ...base, ...overrides };
  const params = new URLSearchParams();
  if (merged.status !== "TODOS") params.set("status", merged.status);
  if (merged.period !== "hoje") params.set("period", merged.period);
  if (merged.q) params.set("q", merged.q);
  const qs = params.toString();
  return qs ? `/pedidos?${qs}` : "/pedidos";
}

export function OrdersFilterBar({ status, period, q }: { status: OrderStatus | "TODOS"; period: string; q: string }) {
  const base = { status, period, q };
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    // Client-side navigation instead of a full browser GET — matches the
    // status/period tabs below, which already use <Link>.
    e.preventDefault();
    router.push(buildHref(base, { q: inputRef.current?.value ?? "" }));
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={handleSubmit} className="flex items-center gap-2 rounded-[11px] border border-border-strong bg-surface px-3.5 py-2.5">
        <Search className="h-[15px] w-[15px] flex-none text-faint" />
        <input
          ref={inputRef}
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Buscar por cliente ou número do pedido"
          className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-faint"
        />
      </form>

      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:gap-2">
        <div className="flex flex-1 gap-1.5 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible lg:pb-0">
          {STATUS_TABS.map((tab) => (
            <Link
              key={tab.value}
              href={buildHref(base, { status: tab.value })}
              className={`flex-none whitespace-nowrap rounded-[9px] px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                status === tab.value ? "bg-charcoal text-white" : "bg-neutral-bg text-muted hover:text-ink"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <div className="flex max-w-full self-start overflow-x-auto rounded-[10px] border border-border-strong bg-surface p-[3px] lg:self-auto lg:overflow-visible">
          {PERIODS.map((p) => (
            <Link
              key={p.value}
              href={buildHref(base, { period: p.value })}
              className={`flex-none whitespace-nowrap rounded-[8px] px-[11px] py-[6px] text-[12.5px] font-medium transition-colors ${
                period === p.value ? "bg-charcoal text-white" : "text-muted hover:text-ink"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
