import Link from "next/link";
import { Plus } from "lucide-react";

import { getTenant } from "@/lib/tenant";
import { listOrders, ORDERS_PAGE_SIZE, type OrderListFilters } from "@/server/queries/orders";
import { FLOW } from "@/lib/order-flow";
import type { OrderStatus } from "@/generated/prisma";
import { OrdersFilterBar } from "@/components/pedidos/orders-filter-bar";
import { OrderListCard } from "@/components/pedidos/order-list-card";

const VALID_STATUSES = Object.keys(FLOW) as OrderStatus[];
const VALID_PERIODS = ["hoje", "7dias", "30dias", "todos"];

export default async function PedidosPage(props: PageProps<"/pedidos">) {
  const searchParams = await props.searchParams;
  const tenant = await getTenant();

  const statusParam = Array.isArray(searchParams.status) ? searchParams.status[0] : searchParams.status;
  const status: OrderStatus | "TODOS" = VALID_STATUSES.includes(statusParam as OrderStatus)
    ? (statusParam as OrderStatus)
    : "TODOS";

  const periodParam = Array.isArray(searchParams.period) ? searchParams.period[0] : searchParams.period;
  const period = (VALID_PERIODS.includes(periodParam ?? "") ? periodParam : "hoje") as NonNullable<OrderListFilters["period"]>;

  const qParam = Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q;
  const q = qParam ?? "";

  const pageParam = Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page;
  const page = Math.max(1, Number(pageParam) || 1);

  const { items, total, hasMore } = await listOrders(tenant.restaurantId, { status, period, q, page });

  const paramsForPage = (p: number) => {
    const sp = new URLSearchParams();
    if (status !== "TODOS") sp.set("status", status);
    if (period !== "hoje") sp.set("period", period);
    if (q) sp.set("q", q);
    sp.set("page", String(p));
    return `/pedidos?${sp.toString()}`;
  };

  return (
    <div className="flex flex-col gap-5 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] font-semibold tracking-tight">Pedidos</h1>
          <p className="text-[13px] text-faint">{total} pedido{total === 1 ? "" : "s"} encontrado{total === 1 ? "" : "s"}</p>
        </div>
        <Link
          href="/pedidos/novo"
          className="ml-auto flex items-center gap-2 rounded-[11px] bg-charcoal px-4 py-[11px] text-[13.5px] font-medium text-white transition-colors hover:bg-accent-hover active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Novo pedido
        </Link>
      </div>

      <OrdersFilterBar status={status} period={period} q={q} />

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[18px] border border-dashed border-border-strong py-16 text-center text-faint">
          <span className="text-[14px] font-medium text-[#3D4351]">Nenhum pedido encontrado</span>
          <span className="text-[12.5px]">Ajuste os filtros ou o período acima</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((order) => (
            <OrderListCard key={order.id} order={order} />
          ))}
        </div>
      )}

      {(page > 1 || hasMore) && items.length > 0 ? (
        <div className="flex items-center justify-center gap-3 pt-2">
          {page > 1 ? (
            <Link href={paramsForPage(page - 1)} className="rounded-[10px] border border-border-strong px-4 py-2 text-[13px] font-medium text-muted hover:text-ink">
              ← Anterior
            </Link>
          ) : null}
          <span className="text-[12.5px] text-faint">
            página {page} · {Math.ceil(total / ORDERS_PAGE_SIZE)}
          </span>
          {hasMore ? (
            <Link href={paramsForPage(page + 1)} className="rounded-[10px] border border-border-strong px-4 py-2 text-[13px] font-medium text-muted hover:text-ink">
              Próxima →
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
