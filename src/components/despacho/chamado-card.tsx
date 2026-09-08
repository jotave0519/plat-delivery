import { MapPin, User, Wrench } from "lucide-react";

import { CHAMADO_FLOW, URGENCIA_LABELS, URGENCIA_TONE } from "@/lib/chamado-flow";
import { TONE_CLASSES } from "@/lib/order-flow";
import { formatDateTimeHeader } from "@/lib/format";
import { ChamadoActions } from "@/components/despacho/chamado-actions";
import type { ChamadoListItem, TecnicoListItem } from "@/server/queries/despacho";

export function ChamadoCard({ chamado, tecnicos }: { chamado: ChamadoListItem; tecnicos: TecnicoListItem[] }) {
  const flow = CHAMADO_FLOW[chamado.status];
  const urgenciaTone = TONE_CLASSES[URGENCIA_TONE[chamado.urgencia]];

  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-[#EDEFF3] bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[14px] font-semibold tracking-tight">{chamado.customerName ?? "Cliente sem nome"}</span>
          {chamado.customerPhone ? <span className="text-[11.5px] text-faint">{chamado.customerPhone}</span> : null}
        </div>
        <span className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-medium ${urgenciaTone.bg} ${urgenciaTone.fg}`}>
          {URGENCIA_LABELS[chamado.urgencia]}
        </span>
      </div>

      <p className="line-clamp-2 text-[13.5px] text-ink">{chamado.problema}</p>

      <div className="flex items-start gap-1.5 text-[12px] text-faint">
        <MapPin className="mt-0.5 h-[12px] w-[12px] flex-none" />
        <span className="line-clamp-1">{chamado.endereco}</span>
      </div>

      {chamado.tecnicoNome ? (
        <div className="flex items-center gap-1.5 text-[12px] text-muted">
          <Wrench className="h-[12px] w-[12px]" />
          {chamado.tecnicoNome}
        </div>
      ) : null}

      <div className="flex items-center justify-between text-[11px] text-faint">
        <span className="flex items-center gap-1">
          <flow.icon className="h-[12px] w-[12px]" />
          {flow.chip}
        </span>
        <span>{formatDateTimeHeader(chamado.createdAt)}</span>
      </div>

      <ChamadoActions chamado={chamado} tecnicos={tecnicos} />
    </div>
  );
}

export function ChamadoEmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-[14px] border border-dashed border-border-strong py-8 text-center">
      <User className="h-[18px] w-[18px] text-faint" />
      <span className="max-w-[220px] text-[12px] text-faint">{text}</span>
    </div>
  );
}
