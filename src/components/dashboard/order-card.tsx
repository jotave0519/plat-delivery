import { Clock, MessageSquare, MessageCircle } from "lucide-react";

import { FLOW, TONE_CLASSES } from "@/lib/order-flow";
import { formatBRL, formatElapsed } from "@/lib/format";
import type { QueueOrder } from "@/server/queries/dashboard";
import { advanceOrderStatus } from "@/server/actions/orders";

export function OrderCard({ order }: { order: QueueOrder }) {
  const flow = FLOW[order.status];
  const tone = TONE_CLASSES[order.atrasado ? "crit" : flow.tone];
  const StatusIcon = flow.icon;
  const NextIcon = flow.nextIcon;

  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-[#EDEFF3] p-4 transition-shadow hover:shadow-[0_14px_30px_-22px_rgba(26,29,35,.45)]">
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
          <form action={advanceOrderStatus.bind(null, order.id)} className="flex-1">
            <button
              type="submit"
              className="flex min-h-10 w-full items-center justify-center gap-2 rounded-[11px] bg-charcoal text-[13.5px] font-medium text-white transition-colors hover:bg-accent-hover active:scale-[0.985]"
            >
              {NextIcon ? <NextIcon className="h-[15px] w-[15px]" /> : null}
              {flow.nextLabel}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
