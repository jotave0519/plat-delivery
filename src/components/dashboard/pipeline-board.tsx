"use client";

import { useState } from "react";
import { CircleCheck } from "lucide-react";

import { FLOW, TONE_CLASSES } from "@/lib/order-flow";
import { OrderCard } from "@/components/dashboard/order-card";
import type { DashboardData } from "@/server/queries/dashboard";
import type { OrderStatus } from "@/generated/prisma";

export function PipelineBoard({
  pipeline,
  queue,
  activeStage: initialStage,
}: {
  pipeline: DashboardData["pipeline"];
  queue: DashboardData["queue"];
  activeStage: OrderStatus;
}) {
  // All stages' orders are already in `queue` — switching the active stage
  // is a pure client-side filter, so it's local state instead of a
  // server round-trip via `<Link href="?stage=...">`. `initialStage` still
  // respects a deep link (e.g. from an alert linking straight to a stage)
  // on first render; the URL just doesn't stay in sync with further clicks.
  const [activeStage, setActiveStage] = useState(initialStage);
  const openCount = pipeline.reduce((sum, s) => sum + s.count, 0);
  const lateCount = pipeline.reduce((sum, s) => sum + s.lateCount, 0);
  const visible = queue.filter((o) => o.status === activeStage);

  return (
    <section className="overflow-hidden rounded-[22px] border border-border bg-surface shadow-[0_1px_2px_rgba(26,29,35,.04)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-border-soft px-5 py-[18px]">
        <h2 className="m-0 text-[16px] font-semibold tracking-tight">Operação agora</h2>
        <span className="text-[12.5px] text-faint">
          {openCount} pedidos em aberto · {lateCount ? `${lateCount} acima do tempo prometido` : "nenhum pedido atrasado"}
        </span>
      </div>

      <div className="flex gap-2.5 overflow-x-auto border-b border-border-soft px-5 py-4">
        {pipeline.map((stage) => {
          const flow = FLOW[stage.status];
          const active = stage.status === activeStage;
          const Icon = flow.icon;
          const tone = TONE_CLASSES[flow.tone];
          return (
            <button
              key={stage.status}
              type="button"
              onClick={() => setActiveStage(stage.status)}
              className={`flex min-w-[132px] flex-none flex-col gap-2 rounded-[15px] border px-3.5 py-3 text-left transition-transform hover:-translate-y-0.5 active:scale-[0.98] ${
                active ? "border-charcoal bg-charcoal" : "border-[#EDEFF3] bg-[#FBFCFD]"
              }`}
            >
              <span className={`flex items-center gap-2 text-[12.5px] font-medium whitespace-nowrap ${active ? "text-[#B9BFCC]" : "text-muted"}`}>
                <Icon className={`h-[15px] w-[15px] ${active ? "text-accent-light" : tone.icon}`} />
                {flow.label}
              </span>
              <span className="flex items-baseline gap-1.5">
                <span className={`text-[24px] font-semibold tracking-tight ${active ? "text-white" : "text-ink"}`}>{stage.count}</span>
                {stage.lateCount ? <span className="text-[11.5px] font-medium text-crit">{stage.lateCount} atrasado</span> : null}
              </span>
            </button>
          );
        })}
      </div>

      <div key={activeStage} className="grid animate-rise-in grid-cols-1 gap-3.5 p-5 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((order) => (
          <OrderCard key={order.id} order={order} />
        ))}
        {visible.length === 0 ? (
          <div className="col-span-full flex flex-col items-center gap-2 py-10 text-faint">
            <CircleCheck className="h-[22px] w-[22px] text-ok" />
            <span className="text-[14px] font-medium text-[#3D4351]">Nada nesta etapa</span>
            <span className="text-[12.5px]">Escolha outro status acima para ver a fila</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
