"use client";

import { useState, useTransition } from "react";
import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";

import { recordMovement } from "@/server/actions/estoque";
import { useToast } from "@/components/ui/toast";

const inputClass =
  "rounded-[9px] border border-border-strong bg-surface px-2.5 py-1.5 text-[13px] text-ink outline-none transition-colors placeholder:text-faint focus:border-accent";

export function MovementForm({ stockItemId, unit }: { stockItemId: string; unit: string }) {
  const [type, setType] = useState<"ENTRADA" | "SAIDA">("ENTRADA");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const qty = Number(quantity.replace(",", "."));
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Informe uma quantidade válida.");
      return;
    }
    startTransition(async () => {
      const result = await recordMovement({ stockItemId, type, quantity: qty, reason: reason || undefined });
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(type === "ENTRADA" ? "Entrada registrada." : "Saída registrada.");
      setQuantity("");
      setReason("");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-[9px] bg-neutral-bg p-[3px]">
          <button
            type="button"
            onClick={() => setType("ENTRADA")}
            className={`flex items-center gap-1 rounded-[7px] px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
              type === "ENTRADA" ? "bg-surface text-ok-fg shadow-[0_1px_2px_rgba(26,29,35,.08)]" : "text-muted"
            }`}
          >
            <ArrowUpCircle className="h-[13px] w-[13px]" />
            Entrada
          </button>
          <button
            type="button"
            onClick={() => setType("SAIDA")}
            className={`flex items-center gap-1 rounded-[7px] px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
              type === "SAIDA" ? "bg-surface text-crit-fg shadow-[0_1px_2px_rgba(26,29,35,.08)]" : "text-muted"
            }`}
          >
            <ArrowDownCircle className="h-[13px] w-[13px]" />
            Saída
          </button>
        </div>
        <input
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder={`qtd. (${unit})`}
          inputMode="decimal"
          className={`${inputClass} w-24`}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-[9px] bg-charcoal px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "…" : "Registrar"}
        </button>
      </div>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motivo (opcional)"
        className={`${inputClass} w-full`}
      />
      {error ? <p className="text-[12px] text-crit-fg">{error}</p> : null}
    </form>
  );
}
