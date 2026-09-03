"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { saveStockItem } from "@/server/actions/estoque";
import { useToast } from "@/components/ui/toast";

const inputClass =
  "rounded-[11px] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent";

export function StockItemForm({
  initial,
  onDone,
  onCancel,
}: {
  initial?: { id: string; name: string; unit: string; minQuantity: number; quantityOnHand?: number };
  onDone?: (id: string) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const [minQuantity, setMinQuantity] = useState(initial ? String(initial.minQuantity) : "");
  const [quantityOnHand, setQuantityOnHand] = useState(initial ? "" : "0");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Informe o nome do item.");
    if (!unit.trim()) return setError("Informe a unidade (ex.: kg, un, L).");
    const min = Number(minQuantity.replace(",", "."));
    if (!Number.isFinite(min) || min < 0) return setError("Estoque mínimo inválido.");

    startTransition(async () => {
      const result = await saveStockItem({
        id: initial?.id,
        name: name.trim(),
        unit: unit.trim(),
        minQuantity: min,
        quantityOnHand: initial ? undefined : Number(quantityOnHand.replace(",", ".")) || 0,
      });
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(initial ? "Item de estoque atualizado." : "Item de estoque criado.");
      if (onDone && result?.id) {
        onDone(result.id);
      } else {
        router.push("/estoque");
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">Nome</span>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Queijo mussarela" />
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">Unidade</span>
          <input className={inputClass} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="kg, un, L…" />
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">Estoque mínimo</span>
          <input className={inputClass} value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} inputMode="decimal" />
        </label>
      </div>

      {initial ? (
        <p className="text-[12px] text-faint">
          Quantidade atual: {initial.quantityOnHand ?? "—"} {unit || initial.unit} — ajuste registrando uma entrada ou saída, não por aqui.
        </p>
      ) : (
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">Quantidade inicial</span>
          <input className={inputClass} value={quantityOnHand} onChange={(e) => setQuantityOnHand(e.target.value)} inputMode="decimal" />
        </label>
      )}

      {error ? <p className="rounded-[10px] bg-crit-bg px-3 py-2 text-[13px] text-crit-fg">{error}</p> : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex min-h-[40px] items-center justify-center rounded-[10px] bg-charcoal px-5 text-[13.5px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Salvando…" : "Salvar"}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className="text-[13px] font-medium text-muted hover:text-ink">
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  );
}
