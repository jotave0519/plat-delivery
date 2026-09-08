import "server-only";

import { db } from "@/lib/db";

export type ChamadoListItem = {
  id: string;
  problema: string;
  endereco: string;
  urgencia: "NORMAL" | "URGENTE" | "EMERGENCIA";
  status: "RECEBIDO" | "OFERTADO" | "A_CAMINHO" | "EM_ATENDIMENTO" | "CONCLUIDO" | "CANCELADO";
  customerName: string | null;
  customerPhone: string | null;
  tecnicoNome: string | null;
  createdAt: Date;
};

/** Open + a recent slice of terminal chamados — enough for the operational queue, not a full history screen. */
export async function listChamados(restaurantId: string): Promise<ChamadoListItem[]> {
  const chamados = await db.chamado.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      customer: { select: { name: true, phone: true } },
      tecnico: { select: { nome: true } },
    },
  });

  return chamados.map((c) => ({
    id: c.id,
    problema: c.problema,
    endereco: c.endereco,
    urgencia: c.urgencia,
    status: c.status,
    customerName: c.customer?.name ?? null,
    customerPhone: c.customer?.phone ?? null,
    tecnicoNome: c.tecnico?.nome ?? null,
    createdAt: c.createdAt,
  }));
}

export type TecnicoListItem = {
  id: string;
  nome: string;
  telefone: string;
  especialidades: string[];
  regioes: string[];
  disponivel: boolean;
};

export async function listTecnicos(restaurantId: string): Promise<TecnicoListItem[]> {
  const tecnicos = await db.tecnicoDisponibilidade.findMany({
    where: { restaurantId },
    orderBy: { nome: "asc" },
  });
  return tecnicos.map((t) => ({
    id: t.id,
    nome: t.nome,
    telefone: t.telefone,
    especialidades: t.especialidades,
    regioes: t.regioes,
    disponivel: t.disponivel,
  }));
}

export function getDespachoSettings(restaurantId: string) {
  return db.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    select: { despachoEscalationPhone: true, despachoOfertaTimeoutMinutos: true },
  });
}
