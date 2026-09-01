import Link from "next/link";
import { Phone, MapPin } from "lucide-react";

import { formatBRL, formatShortDate } from "@/lib/format";
import type { CustomerListItem } from "@/server/queries/clientes";

function formatDate(date: Date | null) {
  return date ? formatShortDate(date) : "nunca";
}

export function CustomerCard({ customer }: { customer: CustomerListItem }) {
  return (
    <Link
      href={`/clientes/${customer.id}`}
      className="flex flex-col gap-3 rounded-[18px] border border-[#EDEFF3] bg-surface p-4 transition-shadow hover:shadow-[0_14px_30px_-22px_rgba(26,29,35,.45)]"
    >
      <div className="flex flex-col gap-0.5">
        <span className="truncate text-[15.5px] font-semibold tracking-tight">{customer.name}</span>
        {customer.phone ? (
          <span className="flex items-center gap-1.5 text-[12.5px] text-faint">
            <Phone className="h-[12px] w-[12px]" />
            {customer.phone}
          </span>
        ) : null}
        {customer.address ? (
          <span className="flex items-start gap-1.5 text-[12px] text-faint">
            <MapPin className="mt-0.5 h-[12px] w-[12px] flex-none" />
            <span className="truncate">{customer.address}</span>
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-border-soft pt-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10.5px] font-medium uppercase tracking-[.04em] text-faint">Pedidos</span>
          <span className="text-[14px] font-semibold">{customer.totalPedidos}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10.5px] font-medium uppercase tracking-[.04em] text-faint">Gasto total</span>
          <span className="text-[14px] font-semibold">{formatBRL(customer.valorGasto)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10.5px] font-medium uppercase tracking-[.04em] text-faint">Último pedido</span>
          <span className="text-[13px] font-medium text-muted">{formatDate(customer.ultimoPedido)}</span>
        </div>
      </div>
    </Link>
  );
}
