import {
  BellRing,
  Hourglass,
  CircleCheck,
  Flame,
  PackageCheck,
  Bike,
  CheckCheck,
  X,
  type LucideIcon,
} from "lucide-react";

import type { OrderStatus } from "@/generated/prisma";

export type Tone = "accent" | "warn" | "crit" | "ok" | "info" | "neutral";

type FlowStep = {
  label: string;
  chip: string;
  icon: LucideIcon;
  next: OrderStatus | null;
  nextLabel: string | null;
  nextIcon: LucideIcon | null;
  tone: Tone;
};

export const FLOW: Record<OrderStatus, FlowStep> = {
  NOVO: {
    label: "Novos",
    chip: "Novo",
    icon: BellRing,
    next: "CONFIRMADO",
    nextLabel: "Confirmar",
    nextIcon: CircleCheck,
    tone: "accent",
  },
  AGUARDANDO_PAGAMENTO: {
    label: "Aguardando pgto",
    chip: "Aguardando pgto",
    icon: Hourglass,
    next: "CONFIRMADO",
    nextLabel: "Registrar pagamento",
    nextIcon: CircleCheck,
    tone: "warn",
  },
  CONFIRMADO: {
    label: "Confirmados",
    chip: "Confirmado",
    icon: CircleCheck,
    next: "EM_PREPARO",
    nextLabel: "Iniciar preparo",
    nextIcon: Flame,
    tone: "neutral",
  },
  EM_PREPARO: {
    label: "Em preparo",
    chip: "Em preparo",
    icon: Flame,
    next: "PRONTO",
    nextLabel: "Marcar pronto",
    nextIcon: PackageCheck,
    tone: "neutral",
  },
  PRONTO: {
    label: "Prontos",
    chip: "Pronto",
    icon: PackageCheck,
    next: "EM_ENTREGA",
    nextLabel: "Despachar",
    nextIcon: Bike,
    tone: "ok",
  },
  EM_ENTREGA: {
    label: "Em entrega",
    chip: "Saiu p/ entrega",
    icon: Bike,
    next: "CONCLUIDO",
    nextLabel: "Confirmar entrega",
    nextIcon: CheckCheck,
    tone: "info",
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

/** Open statuses shown as pipeline columns on the dashboard, in flow order. */
export const PIPELINE_STAGES: OrderStatus[] = [
  "NOVO",
  "AGUARDANDO_PAGAMENTO",
  "CONFIRMADO",
  "EM_PREPARO",
  "PRONTO",
  "EM_ENTREGA",
];

export const TONE_CLASSES: Record<Tone, { bg: string; fg: string; icon: string }> = {
  accent: { bg: "bg-accent-bg", fg: "text-accent-hover", icon: "text-accent" },
  warn: { bg: "bg-warn-bg", fg: "text-warn-fg", icon: "text-warn" },
  crit: { bg: "bg-crit-bg", fg: "text-crit-fg", icon: "text-crit" },
  ok: { bg: "bg-ok-bg", fg: "text-ok-fg", icon: "text-ok" },
  info: { bg: "bg-info-bg", fg: "text-info-fg", icon: "text-info" },
  neutral: { bg: "bg-neutral-bg", fg: "text-neutral-fg", icon: "text-neutral-icon" },
};

export const LATE_THRESHOLD_MINUTES = 20;

export const CHANNEL_LABELS: Record<string, string> = {
  CARDAPIO_PROPRIO: "Cardápio próprio",
  MARKETPLACE: "Marketplace",
  WHATSAPP_IA: "WhatsApp · IA",
  TELEFONE: "Telefone",
  BALCAO: "Balcão",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  PIX: "Pix",
  CARTAO: "Cartão",
  DINHEIRO: "Dinheiro",
  VALE_REFEICAO: "Vale-refeição",
};
