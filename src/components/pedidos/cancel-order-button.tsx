"use client";

import { useTransition } from "react";
import { X, Loader2 } from "lucide-react";

import { cancelOrder } from "@/server/actions/orders";

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    // A single native prompt covers both the confirm step and the optional
    // reason: clicking "Cancelar" on the dialog aborts (returns null) —
    // clicking "OK" proceeds, with or without text typed in.
    const reason = prompt("Cancelar este pedido? Essa ação não pode ser desfeita.\n\nMotivo (opcional):");
    if (reason === null) return;
    startTransition(() => cancelOrder(orderId, reason || undefined));
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="flex items-center gap-2 rounded-[11px] border border-border-strong px-4 py-[11px] text-[13.5px] font-medium text-muted transition-colors hover:border-crit hover:text-crit disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
      Cancelar pedido
    </button>
  );
}
