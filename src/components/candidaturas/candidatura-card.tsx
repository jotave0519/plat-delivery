import { Home, User, FileCheck, FileX } from "lucide-react";

import { TONE_CLASSES, type Tone } from "@/lib/order-flow";
import { formatDateTimeHeader } from "@/lib/format";
import type { CandidaturaListItem } from "@/server/queries/locacao";
import type { StatusCandidatura } from "@/generated/prisma";

const STATUS_LABEL: Record<StatusCandidatura, string> = {
  VISITA_AGENDADA: "Visita agendada",
  DOCUMENTOS_PENDENTES: "Documentos pendentes",
  EM_ANALISE: "Em análise",
};

const STATUS_TONE: Record<StatusCandidatura, Tone> = {
  VISITA_AGENDADA: "info",
  DOCUMENTOS_PENDENTES: "warn",
  EM_ANALISE: "accent",
};

export function CandidaturaCard({ candidatura }: { candidatura: CandidaturaListItem }) {
  const tone = TONE_CLASSES[STATUS_TONE[candidatura.status]];

  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-[#EDEFF3] bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[14px] font-semibold tracking-tight">{candidatura.customerName ?? "Cliente sem nome"}</span>
          <span className="text-[11.5px] text-faint">{candidatura.customerPhone}</span>
        </div>
        <span className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-medium ${tone.bg} ${tone.fg}`}>{STATUS_LABEL[candidatura.status]}</span>
      </div>

      <div className="flex items-start gap-1.5 text-[12px] text-faint">
        <Home className="mt-0.5 h-[12px] w-[12px] flex-none" />
        <span className="line-clamp-1">{candidatura.imovelEndereco}</span>
      </div>

      {candidatura.corretorNome ? (
        <div className="flex items-center gap-1.5 text-[12px] text-muted">
          <User className="h-[12px] w-[12px]" />
          {candidatura.corretorNome}
        </div>
      ) : null}

      {candidatura.visitaAgendadaPara ? (
        <span className="text-[12px] text-ink">Visita: {formatDateTimeHeader(candidatura.visitaAgendadaPara)}</span>
      ) : null}

      <div className="flex items-center gap-3 border-t border-border-soft pt-3 text-[11.5px]">
        <span className={`flex items-center gap-1 ${candidatura.identidadeRecebida ? "text-ok-fg" : "text-faint"}`}>
          {candidatura.identidadeRecebida ? <FileCheck className="h-[13px] w-[13px]" /> : <FileX className="h-[13px] w-[13px]" />}
          Identidade
        </span>
        <span className={`flex items-center gap-1 ${candidatura.comprovanteRendaRecebido ? "text-ok-fg" : "text-faint"}`}>
          {candidatura.comprovanteRendaRecebido ? <FileCheck className="h-[13px] w-[13px]" /> : <FileX className="h-[13px] w-[13px]" />}
          Comprovante de renda
        </span>
      </div>
    </div>
  );
}
