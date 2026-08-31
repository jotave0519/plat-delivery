"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";

import { TONE_CLASSES } from "@/lib/order-flow";
import { StockItemForm } from "@/components/estoque/stock-item-form";
import type { StockItemDetail } from "@/server/queries/estoque";

const STATUS_LABEL: Record<StockItemDetail["status"], string> = { ESGOTADO: "Esgotado", BAIXO: "Baixo", OK: "OK" };
const STATUS_TONE = { ESGOTADO: "crit", BAIXO: "warn", OK: "ok" } as const;

export function StockItemHeader({ item }: { item: StockItemDetail }) {
  const [editing, setEditing] = useState(false);
  const tone = TONE_CLASSES[STATUS_TONE[item.status]];

  if (editing) {
    return (
      <section className="rounded-[20px] border border-border bg-surface p-5">
        <StockItemForm initial={item} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
      </section>
    );
  }

  return (
    <section className="flex items-start gap-3 rounded-[20px] border border-border bg-surface p-5">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h1 className="text-[19px] font-semibold tracking-tight">{item.name}</h1>
        <span className="flex items-baseline gap-2">
          <span className="text-[26px] font-semibold tracking-tight">{item.quantityOnHand}</span>
          <span className="text-[13px] text-faint">
            {item.unit} em estoque · mínimo {item.minQuantity} {item.unit}
          </span>
        </span>
      </div>
      <span className={`flex-none rounded-[9px] px-3 py-1.5 text-[13px] font-semibold ${tone.bg} ${tone.fg}`}>
        {STATUS_LABEL[item.status]}
      </span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="grid h-9 w-9 flex-none place-items-center rounded-[9px] border border-border-strong text-muted transition-colors hover:border-accent hover:text-accent-hover"
        title="Editar"
      >
        <Pencil className="h-[14px] w-[14px]" />
      </button>
    </section>
  );
}
