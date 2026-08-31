"use client";

import { useTransition } from "react";
import { X, Loader2 } from "lucide-react";

import { cancelOrder } from "@/server/actions/orders";

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm("Cancelar este pedido? Essa ação não pode ser desfeita.")) return;
    startTransition(() => cancelOrder(orderId));
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
