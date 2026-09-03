"use client";

import { useOptimistic } from "react";
import { Clock, MessageSquare, MessageCircle } from "lucide-react";

import { FLOW, TONE_CLASSES } from "@/lib/order-flow";
import { formatBRL, formatElapsed } from "@/lib/format";
import type { QueueOrder } from "@/server/queries/dashboard";
import type { OrderStatus } from "@/generated/prisma";
import { advanceOrderStatus } from "@/server/actions/orders";
import { AdvanceStatusButton } from "@/components/pedidos/advance-status-button";
import { useIsRecentOrder } from "@/components/realtime/order-notifications-provider";

export function OrderCard({ order }: { order: QueueOrder }) {
  const isRecent = useIsRecentOrder(order.id);
  // Optimistic: the chip/button reflect the *next* status the instant the
  // button is clicked, instead of waiting for the Server Action + revalidate
  // round-trip. Safe here because the transition is a pure function of the
  // current status (FLOW[status].next), not something the server computes
  // independently — if the action fails, React automatically reverts to
  // `order.status` once the transition settles.
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(
    order.status,
    (_current, next: OrderStatus) => next,
  );
  const flow = FLOW[optimisticStatus];
  const tone = TONE_CLASSES[order.atrasado ? "crit" : flow.tone];
  const StatusIcon = flow.icon;
  const NextIcon = flow.nextIcon;

  async function handleAdvance() {
    const next = FLOW[optimisticStatus].next;
    if (!next) return;
    setOptimisticStatus(next);
    await advanceOrderStatus(order.id);
  }

  return (
    <div
      className={`flex flex-col gap-3 rounded-[18px] border p-4 transition-shadow hover:shadow-[0_14px_30px_-22px_rgba(26,29,35,.45)] ${
        isRecent ? "animate-rise-in border-accent shadow-[0_0_0_3px_var(--color-accent-bg)]" : "border-[#EDEFF3]"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className={`flex items-center gap-1.5 rounded-[8px] px-[9px] py-1 text-[11.5px] font-semibold ${tone.bg} ${tone.fg}`}>
          <StatusIcon className={`h-[13px] w-[13px] ${tone.icon}`} />
          {flow.chip}
        </span>
        <span className="text-[12px] text-[#9AA0AE]">#{order.number}</span>
        <span
          className={`ml-auto flex items-center gap-1.5 text-[12.5px] font-medium ${order.atrasado ? "text-crit" : "text-faint"}`}
        >
          <Clock className="h-[13px] w-[13px]" />
          {formatElapsed(order.minutosAtras)}
        </span>
      </div>

      <div className="flex items-baseline gap-2.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[15.5px] font-semibold tracking-tight">{order.clienteNome}</span>
          <span className="truncate text-[12.5px] text-faint">
            {order.canalLabel} · {order.pagamentoLabel}
          </span>
        </div>
        <span className="ml-auto whitespace-nowrap text-[16px] font-semibold">{formatBRL(order.valor)}</span>
      </div>

      <span className="text-[13px] text-muted">{order.resumo}</span>

      {order.observacao ? (
        <div className="flex items-start gap-2 rounded-[10px] bg-warn-bg px-2.5 py-2">
          <MessageSquare className="mt-0.5 h-[13px] w-[13px] flex-none text-warn" />
          <span className="text-[12px] text-warn-fg">{order.observacao}</span>
        </div>
      ) : null}

      <div className="flex gap-2.5">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-[11px] border border-border-strong text-muted">
          <MessageCircle className="h-4 w-4" />
        </span>
        {flow.next ? (
          <form action={handleAdvance} className="flex-1">
            <AdvanceStatusButton
              label={flow.nextLabel!}
              icon={NextIcon ? <NextIcon className="h-[15px] w-[15px]" /> : null}
              className="flex min-h-10 w-full items-center justify-center gap-2 rounded-[11px] bg-charcoal text-[13.5px] font-medium text-white transition-colors hover:bg-accent-hover active:scale-[0.985] disabled:opacity-60"
            />
          </form>
        ) : null}
      </div>
    </div>
  );
}
