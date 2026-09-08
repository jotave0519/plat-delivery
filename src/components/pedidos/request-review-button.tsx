"use client";

import { useTransition } from "react";
import { Star, Loader2 } from "lucide-react";

import { agendarPedidoAvaliacao } from "@/server/actions/avaliacoes";
import { useToast } from "@/components/ui/toast";

/** Manual trigger for Agente 1's post-service review request (AGENTS.md: "gatilho manual no MVP") — a small addition to the existing order page, not the /avaliacoes history screen. */
export function RequestReviewButton({ orderId, phoneNumber }: { orderId: string; phoneNumber: string }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function handleClick() {
    startTransition(async () => {
      const result = await agendarPedidoAvaliacao({ phoneNumber, orderId });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Pedido de avaliação agendado — será enviado em algumas horas.");
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="flex min-h-[40px] items-center justify-center gap-2 rounded-[10px] border border-border-strong px-4 text-[13px] font-medium text-muted transition-colors hover:border-accent hover:text-accent-hover disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <Star className="h-[14px] w-[14px]" />}
      Pedir avaliação
    </button>
  );
}
