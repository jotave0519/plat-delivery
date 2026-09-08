import "server-only";

import { db } from "@/lib/db";

export type ImovelListItem = {
  id: string;
  endereco: string;
  valorAluguel: number;
  condicoes: string | null;
  fotos: string[];
  disponivel: boolean;
  corretorId: string | null;
  corretorNome: string | null;
};

export async function listImoveis(restaurantId: string): Promise<ImovelListItem[]> {
  const imoveis = await db.imovel.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    include: { corretor: { select: { nome: true } } },
  });
  return imoveis.map((i) => ({
    id: i.id,
    endereco: i.endereco,
    valorAluguel: Number(i.valorAluguel),
    condicoes: i.condicoes,
    fotos: i.fotos,
    disponivel: i.disponivel,
    corretorId: i.corretorId,
    corretorNome: i.corretor?.nome ?? null,
  }));
}

export type CorretorListItem = { id: string; nome: string; telefone: string; disponivel: boolean };

export async function listCorretores(restaurantId: string): Promise<CorretorListItem[]> {
  const corretores = await db.corretor.findMany({ where: { restaurantId }, orderBy: { nome: "asc" } });
  return corretores.map((c) => ({ id: c.id, nome: c.nome, telefone: c.telefone, disponivel: c.disponivel }));
}

export type CandidaturaListItem = {
  id: string;
  imovelEndereco: string;
  customerName: string | null;
  customerPhone: string | null;
  corretorNome: string | null;
  status: "VISITA_AGENDADA" | "DOCUMENTOS_PENDENTES" | "EM_ANALISE";
  visitaAgendadaPara: Date | null;
  identidadeRecebida: boolean;
  comprovanteRendaRecebido: boolean;
  createdAt: Date;
};

export async function listCandidaturas(restaurantId: string): Promise<CandidaturaListItem[]> {
  const candidaturas = await db.candidatura.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { imovel: { select: { endereco: true } }, customer: { select: { name: true, phone: true } }, corretor: { select: { nome: true } } },
  });

  return candidaturas.map((c) => {
    const documentos = c.documentos as { identidade?: unknown; comprovanteRenda?: unknown } | null;
    return {
      id: c.id,
      imovelEndereco: c.imovel.endereco,
      customerName: c.customer?.name ?? null,
      customerPhone: c.customer?.phone ?? c.telefone,
      corretorNome: c.corretor?.nome ?? null,
      status: c.status,
      visitaAgendadaPara: c.visitaAgendadaPara,
      identidadeRecebida: !!documentos?.identidade,
      comprovanteRendaRecebido: !!documentos?.comprovanteRenda,
      createdAt: c.createdAt,
    };
  });
}

export function getLocacaoSettings(restaurantId: string) {
  return db.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { locacaoVisitaDuracaoMin: true } });
}
