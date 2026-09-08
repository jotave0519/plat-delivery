import { BellRing, Send, Bike, Wrench, CheckCheck, X, type LucideIcon } from "lucide-react";

import type { ChamadoStatus, UrgenciaNivel } from "@/generated/prisma";
import type { Tone } from "@/lib/order-flow";

/**
 * Same model as src/lib/order-flow.ts's FLOW/PIPELINE_STAGES, for the
 * Chamado domain (Agente 3 — despacho de serviços residenciais). Unlike
 * Order's FLOW, "next" here is never a plain manual click for every step —
 * OFERTADO→A_CAMINHO and A_CAMINHO→EM_ATENDIMENTO→CONCLUIDO normally happen
 * via the technician's WhatsApp replies (src/server/actions/despacho.ts's
 * handleTecnicoReply). The "next"/"nextLabel" here exist for the manual
 * rescue path in the queue UI (a staff member advancing a stuck chamado by
 * hand — see atualizarStatusChamadoManualmente), not as the primary path.
 */

type ChamadoFlowStep = {
  label: string;
  chip: string;
  icon: LucideIcon;
  next: ChamadoStatus | null;
  nextLabel: string | null;
  nextIcon: LucideIcon | null;
  tone: Tone;
};

export const CHAMADO_FLOW: Record<ChamadoStatus, ChamadoFlowStep> = {
  RECEBIDO: {
    label: "Recebidos",
    chip: "Recebido",
    icon: BellRing,
    next: "A_CAMINHO",
    nextLabel: "Atribuir técnico",
    nextIcon: Send,
    tone: "accent",
  },
  OFERTADO: {
    label: "Ofertados",
    chip: "Aguardando técnico",
    icon: Send,
    next: "A_CAMINHO",
    nextLabel: "Confirmar aceite",
    nextIcon: Bike,
    tone: "warn",
  },
  A_CAMINHO: {
    label: "A caminho",
    chip: "A caminho",
    icon: Bike,
    next: "EM_ATENDIMENTO",
    nextLabel: "Marcar em atendimento",
    nextIcon: Wrench,
    tone: "info",
  },
  EM_ATENDIMENTO: {
    label: "Em atendimento",
    chip: "Em atendimento",
    icon: Wrench,
    next: "CONCLUIDO",
    nextLabel: "Concluir chamado",
    nextIcon: CheckCheck,
    tone: "neutral",
  },
  CONCLUIDO: {
    label: "Concluídos",
    chip: "Concluído",
    icon: CheckCheck,
    next: null,
    nextLabel: null,
    nextIcon: null,
    tone: "ok",
  },
  CANCELADO: {
    label: "Cancelados",
    chip: "Cancelado",
    icon: X,
    next: null,
    nextLabel: null,
    nextIcon: null,
    tone: "crit",
  },
};

/** Open statuses shown as queue columns — CANCELADO/CONCLUIDO are terminal and shown separately. */
export const CHAMADO_PIPELINE_STAGES: ChamadoStatus[] = ["RECEBIDO", "OFERTADO", "A_CAMINHO", "EM_ATENDIMENTO"];

export const URGENCIA_LABELS: Record<UrgenciaNivel, string> = {
  NORMAL: "Normal",
  URGENTE: "Urgente",
  EMERGENCIA: "Emergência",
};

export const URGENCIA_TONE: Record<UrgenciaNivel, Tone> = {
  NORMAL: "neutral",
  URGENTE: "warn",
  EMERGENCIA: "crit",
};
