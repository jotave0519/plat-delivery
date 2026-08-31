"use client";

import { useOptimistic } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { FLOW, TONE_CLASSES } from "@/lib/order-flow";
import type { OrderStatus } from "@/generated/prisma";
import { advanceOrderStatus } from "@/server/actions/orders";
import { CancelOrderButton } from "@/components/pedidos/cancel-order-button";
import { AdvanceStatusButton } from "@/components/pedidos/advance-status-button";

function formatDateTime(date: Date) {
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/**
 * The order detail page's top row (back link, status chip, title, cancel/
 * advance actions) — split out from the page (a Server Component) into its
 * own client component so the status chip and advance button can use
 * `useOptimistic`, same pattern and same reasoning as
 * `src/components/dashboard/order-card.tsx`.
 */
export function OrderStatusHeader({
  orderId,
  number,
  createdAt,
  status,
}: {
  orderId: string;
  number: number;
  createdAt: Date;
  status: OrderStatus;
}) {
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(status, (_current, next: OrderStatus) => next);
  const flow = FLOW[optimisticStatus];
  const tone = TONE_CLASSES[flow.tone];
  const StatusIcon = flow.icon;
  const isFinished = optimisticStatus === "CONCLUIDO" || optimisticStatus === "CANCELADO";

  async function handleAdvance() {
    const next = FLOW[optimisticStatus].next;
    if (!next) return;
    setOptimisticStatus(next);
    await advanceOrderStatus(orderId);
  }

  return (
    <>
      <Link href="/pedidos" className="flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="h-[15px] w-[15px]" />
        Voltar para pedidos
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <span className={`flex items-center gap-1.5 rounded-[9px] px-[11px] py-1.5 text-[13px] font-semibold ${tone.bg} ${tone.fg}`}>
          <StatusIcon className={`h-[15px] w-[15px] ${tone.icon}`} />
          {flow.chip}
        </span>
        <h1 className="text-[21px] font-semibold tracking-tight">Pedido #{number}</h1>
        <span className="text-[12.5px] text-faint">criado em {formatDateTime(createdAt)}</span>

        <div className="ml-auto flex gap-2.5">
          {!isFinished ? <CancelOrderButton orderId={orderId} /> : null}
          {flow.next ? (
            <form action={handleAdvance}>
              <AdvanceStatusButton
                label={flow.nextLabel!}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-[11px] bg-charcoal px-4 text-[13.5px] font-medium text-white transition-colors hover:bg-accent-hover active:scale-[0.98] disabled:opacity-60"
              />
            </form>
          ) : null}
        </div>
      </div>
    </>
  );
}
