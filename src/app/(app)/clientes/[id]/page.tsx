import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";

import { getTenant } from "@/lib/tenant";
import { getCustomerDetail } from "@/server/queries/clientes";
import { listOrders } from "@/server/queries/orders";
import { deleteCustomer } from "@/server/actions/clientes";
import { formatBRL } from "@/lib/format";
import { CustomerInfoCard } from "@/components/clientes/customer-info-card";
import { OrderListCard } from "@/components/pedidos/order-list-card";
import { ConfirmButton } from "@/components/ui/confirm-button";

function formatDate(date: Date | null) {
  if (!date) return "—";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default async function ClienteDetailPage(props: PageProps<"/clientes/[id]">) {
  const { id } = await props.params;
  const tenant = await getTenant();

  // Neither depends on the other's result — fetch in parallel.
  const [customer, { items: orders }] = await Promise.all([
    getCustomerDetail(tenant.restaurantId, id),
    listOrders(tenant.restaurantId, { customerId: id, period: "todos", page: 1 }),
  ]);
  if (!customer) notFound();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <div className="flex items-center gap-3">
        <Link href="/clientes" className="flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
          <ArrowLeft className="h-[15px] w-[15px]" />
          Voltar para clientes
        </Link>
        <ConfirmButton
          action={deleteCustomer.bind(null, customer.id)}
          confirmMessage={`Excluir "${customer.name}"?`}
          label="Excluir cliente"
          icon={<Trash2 className="h-[14px] w-[14px]" />}
          className="ml-auto flex items-center gap-2 rounded-[10px] border border-border-strong px-3.5 py-2 text-[12.5px] font-medium text-muted transition-colors hover:border-crit hover:text-crit disabled:opacity-40"
          disabled={customer.totalPedidos > 0}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_260px]">
        <div className="flex flex-col gap-5">
          <CustomerInfoCard customer={customer} />

          <section className="flex flex-col gap-3">
            <h2 className="text-[15px] font-semibold tracking-tight">Histórico de pedidos</h2>
            {orders.length === 0 ? (
              <div className="flex flex-col items-center gap-1 rounded-[16px] border border-dashed border-border-strong py-10 text-center text-faint">
                <span className="text-[13px]">Nenhum pedido ainda</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {orders.map((order) => (
                  <OrderListCard key={order.id} order={order} />
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-3">
          <div className="rounded-[16px] border border-border bg-surface p-4">
            <span className="text-[11px] font-medium uppercase tracking-[.05em] text-faint">Total de pedidos</span>
            <p className="text-[22px] font-semibold tracking-tight">{customer.totalPedidos}</p>
          </div>
          <div className="rounded-[16px] border border-border bg-surface p-4">
            <span className="text-[11px] font-medium uppercase tracking-[.05em] text-faint">Valor gasto</span>
            <p className="text-[22px] font-semibold tracking-tight">{formatBRL(customer.valorGasto)}</p>
          </div>
          <div className="rounded-[16px] border border-border bg-surface p-4">
            <span className="text-[11px] font-medium uppercase tracking-[.05em] text-faint">Ticket médio</span>
            <p className="text-[22px] font-semibold tracking-tight">{formatBRL(customer.ticketMedio)}</p>
          </div>
          <div className="rounded-[16px] border border-border bg-surface p-4">
            <span className="text-[11px] font-medium uppercase tracking-[.05em] text-faint">Último pedido</span>
            <p className="text-[15px] font-medium">{formatDate(customer.ultimoPedido)}</p>
          </div>
          <div className="rounded-[16px] border border-border bg-surface p-4">
            <span className="text-[11px] font-medium uppercase tracking-[.05em] text-faint">Cliente desde</span>
            <p className="text-[15px] font-medium">{formatDate(customer.createdAt)}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
