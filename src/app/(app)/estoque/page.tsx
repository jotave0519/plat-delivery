import Link from "next/link";
import { Plus } from "lucide-react";

import { getTenant } from "@/lib/tenant";
import { listStockItems } from "@/server/queries/estoque";
import { StockItemCard } from "@/components/estoque/stock-item-card";

export default async function EstoquePage() {
  const tenant = await getTenant();
  const items = await listStockItems(tenant.restaurantId);

  return (
    <div className="flex flex-col gap-5 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] font-semibold tracking-tight">Estoque</h1>
          <p className="text-[13px] text-faint">{items.length} item{items.length === 1 ? "" : "ns"} cadastrado{items.length === 1 ? "" : "s"}</p>
        </div>
        <Link
          href="/estoque/novo"
          className="ml-auto flex items-center gap-2 rounded-[11px] bg-charcoal px-4 py-[11px] text-[13.5px] font-medium text-white transition-colors hover:bg-accent-hover active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Novo item
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[18px] border border-dashed border-border-strong py-16 text-center text-faint">
          <span className="text-[14px] font-medium text-[#3D4351]">Nenhum item de estoque ainda</span>
          <span className="text-[12.5px]">Cadastre o primeiro ingrediente ou insumo acima</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <StockItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
