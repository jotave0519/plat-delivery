"use client";

import { useState } from "react";
import { AlertTriangle, CircleCheck, ChevronDown, ChevronUp, Hourglass, Boxes, EyeOff } from "lucide-react";

import type { DashboardData } from "@/server/queries/dashboard";

function iconFor(title: string) {
  if (title.includes("aguardando pagamento")) return Hourglass;
  if (title.includes("zerado") || title.includes("baixo")) return Boxes;
  if (title.includes("pausado")) return EyeOff;
  return AlertTriangle;
}

export function AlertsBanner({ alerts }: { alerts: DashboardData["alerts"] }) {
  const [open, setOpen] = useState(false);
  const { critical, secondary } = alerts;

  return (
    <section className="flex flex-col gap-4 rounded-[20px] border border-border bg-surface px-[22px] py-5 shadow-[0_1px_2px_rgba(26,29,35,.04)]">
      <div className="flex items-center gap-2.5">
        <span
          className={`h-[7px] w-[7px] rounded-full ${critical.positive ? "bg-ok" : "bg-crit animate-breathe"}`}
        />
        <h2 className="m-0 text-[15.5px] font-semibold tracking-tight">Precisa da sua atenção</h2>
        <span className="text-[12.5px] text-faint">{secondary.length + 1} situações</span>
        {secondary.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="ml-auto flex items-center gap-1.5 text-[12.5px] font-medium text-accent-hover"
          >
            {open ? "recolher" : `ver as outras ${secondary.length}`}
            {open ? <ChevronUp className="h-[15px] w-[15px]" /> : <ChevronDown className="h-[15px] w-[15px]" />}
          </button>
        ) : null}
      </div>

      <div
        className={`flex flex-wrap items-center gap-4 rounded-[16px] px-[18px] py-4 ${
          critical.positive ? "bg-ok-bg" : "bg-crit-bg-soft"
        }`}
      >
        <div className="flex min-w-0 items-start gap-3">
          {critical.positive ? (
            <CircleCheck className="h-5 w-5 flex-none text-ok" />
          ) : (
            <AlertTriangle className="h-5 w-5 flex-none text-crit" />
          )}
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[16px] font-semibold tracking-tight text-ink">{critical.title}</span>
            <span className={`text-[13px] ${critical.positive ? "text-ok-fg" : "text-[#8B5A4C]"}`}>{critical.sub}</span>
          </div>
        </div>
        {!critical.positive ? (
          <a
            href={`/dashboard?stage=${critical.targetStatus}`}
            className="ml-auto flex items-center gap-2 rounded-[11px] bg-crit px-4 py-[11px] text-[13.5px] font-medium text-white transition-colors hover:bg-crit-hover active:scale-[0.98]"
          >
            {critical.actionLabel}
          </a>
        ) : null}
      </div>

      {open ? (
        <div className="grid animate-unfold grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {secondary.map((item, i) => {
            const Icon = iconFor(item.title);
            return (
              <div
                key={i}
                className="flex items-start gap-2.5 rounded-[13px] border border-border-soft bg-[#FAFBFC] px-3.5 py-3"
              >
                <Icon className="mt-0.5 h-4 w-4 flex-none text-warn" />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[13px] font-medium">{item.title}</span>
                  <span className="text-[12px] text-faint">{item.sub}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
