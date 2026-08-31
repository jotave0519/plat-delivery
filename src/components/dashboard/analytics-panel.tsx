"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { formatBRL } from "@/lib/format";
import type { DashboardData } from "@/server/queries/dashboard";

type TabKey = "Volume" | "Canais" | "Tempos" | "Recebimentos" | "Resumo";

const TABS: { key: TabKey; label: string }[] = [
  { key: "Volume", label: "Volume" },
  { key: "Canais", label: "Canais" },
  { key: "Tempos", label: "Tempos" },
  { key: "Recebimentos", label: "Recebimentos" },
  { key: "Resumo", label: "Resumo do período" },
];

type Row = { name: string; value: string; pct?: string; note?: string; color?: string };

function buildRows(tab: TabKey, a: DashboardData["analytics"]): Row[] {
  if (tab === "Canais") {
    return a.canais.map((c) => ({ name: c.name, value: String(c.count), note: c.pct, pct: c.pct }));
  }
  if (tab === "Recebimentos") {
    return a.recebimentos.map((r) => ({ name: r.name, value: formatBRL(r.amount), note: r.pct, pct: r.pct }));
  }
  if (tab === "Tempos") {
    return [
      { name: "Preparo na cozinha", value: a.tempos.prepMedio != null ? `${a.tempos.prepMedio} min` : "sem dados" },
      { name: "Entrega ao cliente", value: a.tempos.entregaMedio != null ? `${a.tempos.entregaMedio} min` : "sem dados" },
      {
        name: "Acima do tempo prometido",
        value: `${a.tempos.acimaDoPrometido} pedido${a.tempos.acimaDoPrometido === 1 ? "" : "s"}`,
        color: a.tempos.acimaDoPrometido ? "var(--color-crit-fg)" : "var(--color-ok-fg)",
      },
    ];
  }
  return [
    { name: "Concluídos", value: String(a.resumo.concluidos), color: "var(--color-ok-fg)" },
    { name: "Cancelados", value: String(a.resumo.cancelados), color: a.resumo.cancelados ? "var(--color-crit-fg)" : undefined },
    { name: "Retirada no balcão", value: String(a.resumo.retirada) },
    { name: "A receber de marketplaces", value: formatBRL(a.resumo.aReceberMarketplace) },
  ];
}

function buildTeaser(a: DashboardData["analytics"], periodLabel: string) {
  if (a.volume.every((b) => b.count === 0) && a.canais.length === 0) {
    return `Sem pedidos em ${periodLabel.toLowerCase()} ainda`;
  }
  const peak = a.volume.reduce<{ label: string; count: number } | null>(
    (max, b) => (b.count > (max?.count ?? -1) ? b : max),
    null,
  );
  const top = a.canais[0];
  const parts: string[] = [];
  if (peak && peak.count > 0) parts.push(`pico ${peak.label}`);
  if (top) parts.push(`${top.pct} via ${top.name.toLowerCase()}`);
  if (a.tempos.prepMedio != null) parts.push(`preparo ${a.tempos.prepMedio} min`);
  return parts.join(" · ") || "Ainda sem dados suficientes";
}

function VolumeChart({ data }: { data: { label: string; count: number }[] }) {
  if (data.length === 0) {
    return <p className="text-[13px] text-faint">Sem pedidos neste período ainda.</p>;
  }
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex h-[150px] items-end gap-[clamp(5px,.8vw,12px)]">
        {data.map((b, i) => {
          const pct = Math.max(6, Math.round((b.count / max) * 100));
          const peak = b.count === max && b.count > 0;
          return (
            <div key={i} className="flex h-full flex-1 flex-col justify-end" title={`${b.label} · ${b.count} pedidos`}>
              <div
                className={`origin-bottom animate-grow-up rounded-[5px] ${peak ? "bg-accent" : "bg-[#E1E5EB]"}`}
                style={{ height: `${pct}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-[clamp(5px,.8vw,12px)]">
        {data.map((b, i) => (
          <span
            key={i}
            className={`flex-1 text-center text-[10.5px] ${b.count === max && b.count > 0 ? "text-accent-hover" : "text-[#9AA0AE]"}`}
          >
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function AnalyticsPanel({ analytics, periodLabel }: { analytics: DashboardData["analytics"]; periodLabel: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("Volume");

  const rows = buildRows(tab, analytics);

  return (
    <section className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-[0_1px_2px_rgba(26,29,35,.04)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-3.5 px-[22px] py-[18px] text-left transition-colors hover:bg-[#FBFCFD]"
      >
        <div className="flex flex-col gap-0.5">
          <h2 className="m-0 text-[15.5px] font-semibold tracking-tight">Análises do período</h2>
          <span className="text-[12.5px] text-faint">{buildTeaser(analytics, periodLabel)}</span>
        </div>
        <span className="ml-auto flex items-center gap-1.5 text-[12.5px] font-medium text-muted">
          {open ? "recolher" : "ver detalhes"}
          {open ? <ChevronUp className="h-[15px] w-[15px]" /> : <ChevronDown className="h-[15px] w-[15px]" />}
        </span>
      </button>

      {open ? (
        <div className="flex animate-unfold flex-col gap-[18px] px-[22px] pb-[22px]">
          <div className="flex flex-wrap gap-[5px] self-start rounded-[12px] bg-neutral-bg p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`whitespace-nowrap rounded-[9px] px-[15px] py-2 text-[12.5px] font-medium transition-colors ${
                  tab === t.key ? "bg-surface text-ink shadow-[0_1px_2px_rgba(26,29,35,.08)]" : "text-muted"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "Volume" ? (
            <VolumeChart data={analytics.volume} />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {rows.map((row, i) => (
                <div key={i} className="flex flex-col gap-[7px]">
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-[13.5px] text-[#3D4351]">{row.name}</span>
                    <span className="ml-auto text-[14px] font-semibold" style={row.color ? { color: row.color } : undefined}>
                      {row.value}
                    </span>
                    {row.note ? <span className="w-10 text-right text-[11.5px] text-faint">{row.note}</span> : null}
                  </div>
                  {row.pct ? (
                    <div className="h-[5px] overflow-hidden rounded-[4px] bg-[#EEF1F4]">
                      <div className="h-full rounded-[4px] bg-charcoal transition-[width] duration-500" style={{ width: row.pct }} />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
