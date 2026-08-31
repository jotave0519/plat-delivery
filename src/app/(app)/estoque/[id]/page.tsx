import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpCircle, ArrowDownCircle, Trash2 } from "lucide-react";

import { getTenant } from "@/lib/tenant";
import { getStockItemDetail } from "@/server/queries/estoque";
import { deleteStockItem } from "@/server/actions/estoque";
import { StockItemHeader } from "@/components/estoque/stock-item-header";
import { MovementForm } from "@/components/estoque/movement-form";
import { ConfirmButton } from "@/components/ui/confirm-button";

function formatDateTime(date: Date) {
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function EstoqueItemPage(props: PageProps<"/estoque/[id]">) {
  const { id } = await props.params;
  const tenant = await getTenant();
  const item = await getStockItemDetail(tenant.restaurantId, id);
  if (!item) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <div className="flex items-center gap-3">
        <Link href="/estoque" className="flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
          <ArrowLeft className="h-[15px] w-[15px]" />
          Voltar para o estoque
        </Link>
        <ConfirmButton
          action={deleteStockItem.bind(null, item.id)}
          confirmMessage={`Excluir "${item.name}"? O histórico de movimentações também será apagado.`}
          label="Excluir item"
          icon={<Trash2 className="h-[14px] w-[14px]" />}
          className="ml-auto flex items-center gap-2 rounded-[10px] border border-border-strong px-3.5 py-2 text-[12.5px] font-medium text-muted transition-colors hover:border-crit hover:text-crit"
        />
      </div>

      <StockItemHeader item={item} />

      <section className="flex flex-col gap-3 rounded-[20px] border border-border bg-surface p-5">
        <h2 className="text-[15px] font-semibold tracking-tight">Registrar movimentação</h2>
        <MovementForm stockItemId={item.id} unit={item.unit} />
      </section>

      <section className="flex flex-col gap-3 rounded-[20px] border border-border bg-surface p-5">
        <h2 className="text-[15px] font-semibold tracking-tight">Histórico</h2>
        {item.movements.length === 0 ? (
          <p className="text-[13px] text-faint">Nenhuma movimentação registrada ainda.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border-soft">
            {item.movements.map((m) => (
              <div key={m.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                {m.type === "ENTRADA" ? (
                  <ArrowUpCircle className="h-4 w-4 flex-none text-ok" />
                ) : (
                  <ArrowDownCircle className="h-4 w-4 flex-none text-crit" />
                )}
                <span className="text-[13.5px] font-medium">
                  {m.type === "ENTRADA" ? "+" : "−"}
                  {m.quantity} {item.unit}
                </span>
                {m.reason ? <span className="truncate text-[12.5px] text-faint">{m.reason}</span> : null}
                <span className="ml-auto whitespace-nowrap text-[12px] text-faint">{formatDateTime(m.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
