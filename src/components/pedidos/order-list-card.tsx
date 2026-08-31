import Link from "next/link";
import { Clock, MapPin } from "lucide-react";

import { FLOW, TONE_CLASSES } from "@/lib/order-flow";
import { formatBRL, formatElapsed } from "@/lib/format";
import type { OrderListItem } from "@/server/queries/orders";

export function OrderListCard({ order }: { order: OrderListItem }) {
  const flow = FLOW[order.status];
  const tone = TONE_CLASSES[order.atrasado ? "crit" : flow.tone];
  const StatusIcon = flow.icon;

  return (
    <Link
      href={`/pedidos/${order.id}`}
      className="flex flex-col gap-3 rounded-[18px] border border-[#EDEFF3] bg-surface p-4 transition-shadow hover:shadow-[0_14px_30px_-22px_rgba(26,29,35,.45)]"
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

      {order.endereco ? (
        <div className="flex items-start gap-1.5 text-[12px] text-faint">
          <MapPin className="mt-0.5 h-[12px] w-[12px] flex-none" />
          <span className="truncate">{order.endereco}</span>
        </div>
      ) : null}
    </Link>
  );
}
