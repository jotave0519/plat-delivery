import { getTenant } from "@/lib/tenant";
import { getCatalogForOrderForm } from "@/server/queries/orders";
import { NewOrderForm } from "@/components/pedidos/new-order-form";

export default async function NovoPedidoPage() {
  const tenant = await getTenant();
  const catalog = await getCatalogForOrderForm(tenant.restaurantId);

  return (
    <div className="flex flex-col gap-6 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] font-semibold tracking-tight">Novo pedido</h1>
        <p className="text-[13.5px] text-muted">Registre um pedido recebido por telefone ou feito no balcão.</p>
      </div>
      <NewOrderForm catalog={catalog} />
    </div>
  );
}
