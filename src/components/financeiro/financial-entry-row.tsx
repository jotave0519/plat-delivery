"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { formatBRL, formatShortDate } from "@/lib/format";
import { deleteFinancialEntry } from "@/server/actions/financeiro";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { FinancialEntryForm } from "@/components/financeiro/financial-entry-form";
import type { FinancialEntryItem } from "@/server/queries/financeiro";

export function FinancialEntryRow({ entry }: { entry: FinancialEntryItem }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="rounded-[12px] border border-border-soft p-3">
        <FinancialEntryForm initial={entry} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13.5px] font-medium">{entry.category}</span>
        {entry.description ? <span className="truncate text-[12px] text-faint">{entry.description}</span> : null}
      </div>
      <span className="whitespace-nowrap text-[12.5px] text-faint">{formatShortDate(entry.date)}</span>
      <span className={`whitespace-nowrap text-[14px] font-semibold ${entry.type === "DESPESA" ? "text-crit-fg" : "text-ok-fg"}`}>
        {entry.type === "DESPESA" ? "−" : "+"}
        {formatBRL(entry.amount)}
      </span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="grid h-7 w-7 flex-none place-items-center rounded-[7px] text-faint transition-colors hover:bg-neutral-bg hover:text-ink"
        title="Editar"
      >
        <Pencil className="h-[13px] w-[13px]" />
      </button>
      <ConfirmButton
        action={deleteFinancialEntry.bind(null, entry.id)}
        confirmMessage={`Excluir o lançamento "${entry.category}"?`}
        icon={<Trash2 className="h-[13px] w-[13px]" />}
        className="grid h-7 w-7 flex-none place-items-center rounded-[7px] text-faint transition-colors hover:bg-crit-bg hover:text-crit"
      />
    </div>
  );
}
