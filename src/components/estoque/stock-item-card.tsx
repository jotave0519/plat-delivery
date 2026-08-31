"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Trash2, ExternalLink } from "lucide-react";

import { TONE_CLASSES } from "@/lib/order-flow";
import { deleteStockItem } from "@/server/actions/estoque";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { MovementForm } from "@/components/estoque/movement-form";
import { StockItemForm } from "@/components/estoque/stock-item-form";
import type { StockItemListEntry } from "@/server/queries/estoque";

const STATUS_LABEL: Record<StockItemListEntry["status"], string> = {
  ESGOTADO: "Esgotado",
  BAIXO: "Baixo",
  OK: "OK",
};
const STATUS_TONE = { ESGOTADO: "crit", BAIXO: "warn", OK: "ok" } as const;

export function StockItemCard({ item }: { item: StockItemListEntry }) {
  const [editing, setEditing] = useState(false);
  const tone = TONE_CLASSES[STATUS_TONE[item.status]];

  if (editing) {
    return (
      <div className="rounded-[16px] border border-border-soft p-3.5">
        <StockItemForm initial={item} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-border-soft p-3.5">
      <div className="flex items-start gap-2.5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[14px] font-medium">{item.name}</span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-[19px] font-semibold tracking-tight">{item.quantityOnHand}</span>
            <span className="text-[12px] text-faint">
              {item.unit} · mínimo {item.minQuantity} {item.unit}
            </span>
          </span>
        </div>
        <span className={`flex-none rounded-[8px] px-[9px] py-1 text-[11.5px] font-semibold ${tone.bg} ${tone.fg}`}>
          {STATUS_LABEL[item.status]}
        </span>
      </div>

      <MovementForm stockItemId={item.id} unit={item.unit} />

      <div className="flex gap-2 border-t border-border-soft pt-2.5">
        <Link
          href={`/estoque/${item.id}`}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-[9px] border border-border-strong py-1.5 text-[12.5px] font-medium text-muted transition-colors hover:border-accent hover:text-accent-hover"
        >
          <ExternalLink className="h-[13px] w-[13px]" />
          Histórico
        </Link>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="grid h-8 w-8 place-items-center rounded-[9px] border border-border-strong text-muted transition-colors hover:border-accent hover:text-accent-hover"
          title="Editar"
        >
          <Pencil className="h-[13px] w-[13px]" />
        </button>
        <ConfirmButton
          action={deleteStockItem.bind(null, item.id)}
          confirmMessage={`Excluir "${item.name}"? O histórico de movimentações também será apagado.`}
          icon={<Trash2 className="h-[13px] w-[13px]" />}
          className="grid h-8 w-8 place-items-center rounded-[9px] border border-border-strong text-muted transition-colors hover:border-crit hover:text-crit"
        />
      </div>
    </div>
  );
}
