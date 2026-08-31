"use client";

import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { FinanceiroPeriod } from "@/server/queries/financeiro";

const PERIODS: { value: FinanceiroPeriod; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "7dias", label: "7 dias" },
  { value: "30dias", label: "30 dias" },
  { value: "personalizado", label: "Personalizado" },
];

export function PeriodFilter({ period, from, to }: { period: FinanceiroPeriod; from: string; to: string }) {
  const router = useRouter();
  const fromRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    // Client-side navigation instead of a full browser GET — matches the
    // period tabs above (already <Link>) and the other filter bars.
    e.preventDefault();
    const f = fromRef.current?.value;
    const t = toRef.current?.value;
    if (!f || !t) return;
    router.push(`/financeiro?period=personalizado&from=${f}&to=${t}`);
  }

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
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-muted">De</span>
            <input
              ref={fromRef}
              type="date"
              defaultValue={from}
              required
              className="rounded-[9px] border border-border-strong bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-muted">Até</span>
            <input
              ref={toRef}
              type="date"
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
