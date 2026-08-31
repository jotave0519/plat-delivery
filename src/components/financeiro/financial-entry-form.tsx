"use client";

import { useState, useTransition } from "react";

import { saveFinancialEntry } from "@/server/actions/financeiro";
import type { FinancialEntryItem } from "@/server/queries/financeiro";
import { useToast } from "@/components/ui/toast";

const inputClass =
  "rounded-[10px] border border-border-strong bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors placeholder:text-faint focus:border-accent";

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function FinancialEntryForm({
  initial,
  onDone,
  onCancel,
}: {
  initial?: FinancialEntryItem;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const [type, setType] = useState<"RECEITA" | "DESPESA">(initial?.type ?? "DESPESA");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [date, setDate] = useState(initial ? toDateInputValue(initial.date) : toDateInputValue(new Date()));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amountNumber = Number(amount.replace(",", "."));
    if (!category.trim()) return setError("Informe a categoria.");
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) return setError("Valor inválido.");

    startTransition(async () => {
      const result = await saveFinancialEntry({
        id: initial?.id,
        type,
        category: category.trim(),
        amount: amountNumber,
        description: description.trim() || undefined,
        date,
      });
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(initial ? "Lançamento atualizado." : "Lançamento adicionado.");
      if (!initial) {
        setCategory("");
        setAmount("");
        setDescription("");
      }
      onDone?.();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-end gap-2.5">
        <div className="flex rounded-[9px] bg-neutral-bg p-[3px]">
          <button
            type="button"
            onClick={() => setType("DESPESA")}
            className={`rounded-[7px] px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
              type === "DESPESA" ? "bg-surface text-crit-fg shadow-[0_1px_2px_rgba(26,29,35,.08)]" : "text-muted"
            }`}
          >
            Despesa
          </button>
          <button
            type="button"
            onClick={() => setType("RECEITA")}
            className={`rounded-[7px] px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
              type === "RECEITA" ? "bg-surface text-ok-fg shadow-[0_1px_2px_rgba(26,29,35,.08)]" : "text-muted"
            }`}
          >
            Receita
          </button>
        </div>
        <input className={`${inputClass} flex-1`} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Categoria (ex.: Aluguel, Insumos)" />
        <input className={`${inputClass} w-28`} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" inputMode="decimal" />
        <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <input
        className={inputClass}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Descrição (opcional)"
      />

      {error ? <p className="text-[12.5px] text-crit-fg">{error}</p> : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex min-h-[38px] items-center justify-center rounded-[9px] bg-charcoal px-4 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Salvando…" : initial ? "Salvar" : "Adicionar"}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className="text-[12.5px] font-medium text-muted hover:text-ink">
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  );
}
