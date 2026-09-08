"use client";

import { useTransition } from "react";
import { Loader2, Check, X } from "lucide-react";

import { marcarOrcamentoManualmente } from "@/server/actions/orcamento";
import { useToast } from "@/components/ui/toast";
import { TONE_CLASSES, type Tone } from "@/lib/order-flow";
import { formatDateTimeHeader } from "@/lib/format";
import type { QuoteListItem } from "@/server/queries/orcamento";
import type { QuoteStatus } from "@/generated/prisma";

const STATUS_LABEL: Record<QuoteStatus, string> = {
  ENVIADO: "Enviado",
  ACEITO: "Aceito",
  RECUSADO: "Recusado",
  EXPIRADO: "Expirado",
};

const STATUS_TONE: Record<QuoteStatus, Tone> = {
  ENVIADO: "warn",
  ACEITO: "ok",
  RECUSADO: "crit",
  EXPIRADO: "neutral",
};

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function QuoteCard({ quote }: { quote: QuoteListItem }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const tone = TONE_CLASSES[STATUS_TONE[quote.status]];

  function handleMark(status: QuoteStatus) {
    startTransition(async () => {
      const result = await marcarOrcamentoManualmente(quote.id, status);
      if (result?.error) toast.error(result.error);
      else toast.success("Orçamento atualizado.");
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-[#EDEFF3] bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[14px] font-semibold tracking-tight">{quote.customerName ?? "Cliente sem nome"}</span>
          {quote.customerPhone ? <span className="text-[11.5px] text-faint">{quote.customerPhone}</span> : null}
        </div>
        <span className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-medium ${tone.bg} ${tone.fg}`}>{STATUS_LABEL[quote.status]}</span>
      </div>

      <div className="flex flex-col gap-1 text-[12px] text-faint">
        {Object.entries(quote.dadosColetados).map(([k, v]) => (
          <span key={k}>
            {k}: {v}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between text-[13px]">
        <span className="font-semibold">{formatCurrency(quote.precoCalculado)}</span>
        <span className="text-[11px] text-faint">válido até {formatDateTimeHeader(quote.validoAte)}</span>
      </div>

      {quote.status === "ENVIADO" ? (
        <div className="flex items-center gap-2 border-t border-border-soft pt-3">
          <button
            type="button"
            onClick={() => handleMark("ACEITO")}
            disabled={pending}
            className="flex items-center gap-1.5 rounded-[9px] border border-border-strong px-3 py-1.5 text-[12.5px] font-medium text-muted transition-colors hover:border-ok hover:text-ok-fg disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : <Check className="h-[13px] w-[13px]" />}
            Marcar aceito
          </button>
          <button
            type="button"
            onClick={() => handleMark("RECUSADO")}
            disabled={pending}
            className="flex items-center gap-1.5 rounded-[9px] border border-border-strong px-3 py-1.5 text-[12.5px] font-medium text-muted transition-colors hover:border-crit hover:text-crit disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : <X className="h-[13px] w-[13px]" />}
            Marcar recusado
          </button>
        </div>
      ) : null}
    </div>
  );
}
