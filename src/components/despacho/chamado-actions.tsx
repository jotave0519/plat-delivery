"use client";

import { useState, useTransition } from "react";
import { Loader2, Send, ArrowRight, X } from "lucide-react";

import { atribuirTecnicoManualmente, atualizarStatusChamadoManualmente, cancelarChamado } from "@/server/actions/despacho";
import { useToast } from "@/components/ui/toast";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { CHAMADO_FLOW } from "@/lib/chamado-flow";
import type { ChamadoListItem } from "@/server/queries/despacho";
import type { TecnicoListItem } from "@/server/queries/despacho";

/**
 * The manual "rescue path" for a chamado — normally the técnico's own
 * WhatsApp replies drive every transition (src/server/actions/despacho.ts's
 * handleTecnicoReply), but escalarParaHumano only ever sends an alert; a
 * human has to be able to finish the job by hand from here (assign a
 * technician directly, force-advance a stuck status, or cancel).
 */
export function ChamadoActions({ chamado, tecnicos }: { chamado: ChamadoListItem; tecnicos: TecnicoListItem[] }) {
  const [pending, startTransition] = useTransition();
  const [tecnicoId, setTecnicoId] = useState("");
  const toast = useToast();

  const flow = CHAMADO_FLOW[chamado.status];
  const isTerminal = chamado.status === "CONCLUIDO" || chamado.status === "CANCELADO";

  function handleAssign() {
    if (!tecnicoId) return;
    startTransition(async () => {
      const result = await atribuirTecnicoManualmente(chamado.id, tecnicoId);
      if (result?.error) toast.error(result.error);
      else toast.success("Técnico atribuído.");
    });
  }

  function handleAdvance() {
    if (!flow.next) return;
    startTransition(async () => {
      const result = await atualizarStatusChamadoManualmente(chamado.id, flow.next!);
      if (result?.error) toast.error(result.error);
      else toast.success("Status atualizado.");
    });
  }

  if (isTerminal) return null;

  return (
    <div className="flex flex-col gap-2 border-t border-border-soft pt-3">
      {(chamado.status === "RECEBIDO" || chamado.status === "OFERTADO") && (
        <div className="flex items-center gap-1.5">
          <select
            value={tecnicoId}
            onChange={(e) => setTecnicoId(e.target.value)}
            className="min-w-0 flex-1 rounded-[9px] border border-border-strong bg-surface px-2.5 py-1.5 text-[12.5px]"
          >
            <option value="">Atribuir técnico manualmente…</option>
            {tecnicos.filter((t) => t.disponivel).map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAssign}
            disabled={pending || !tecnicoId}
            className="flex flex-none items-center gap-1 rounded-[9px] border border-border-strong px-2.5 py-1.5 text-[12.5px] font-medium text-muted transition-colors hover:border-accent hover:text-accent-hover disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : <Send className="h-[13px] w-[13px]" />}
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        {flow.next ? (
          <button
            type="button"
            onClick={handleAdvance}
            disabled={pending}
            className="flex items-center gap-1.5 rounded-[9px] border border-border-strong px-3 py-1.5 text-[12.5px] font-medium text-muted transition-colors hover:border-accent hover:text-accent-hover disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : <ArrowRight className="h-[13px] w-[13px]" />}
            {flow.nextLabel}
          </button>
        ) : null}
        <ConfirmButton
          action={() => cancelarChamado(chamado.id)}
          confirmMessage="Cancelar este chamado?"
          label="Cancelar"
          icon={<X className="h-[13px] w-[13px]" />}
          className="flex items-center gap-1.5 rounded-[9px] border border-border-strong px-3 py-1.5 text-[12.5px] font-medium text-muted transition-colors hover:border-crit hover:text-crit disabled:opacity-50"
        />
      </div>
    </div>
  );
}
