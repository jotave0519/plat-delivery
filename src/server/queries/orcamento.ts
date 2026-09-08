import "server-only";

import { db } from "@/lib/db";

export type QuoteListItem = {
  id: string;
  customerName: string | null;
  customerPhone: string | null;
  dadosColetados: Record<string, number>;
  precoCalculado: number;
  status: "ENVIADO" | "ACEITO" | "EXPIRADO" | "RECUSADO";
  validoAte: Date;
  createdAt: Date;
};

/** Recent quotes, most recent first — enough for the operational queue, not a full history/report screen. */
export async function listQuotes(restaurantId: string): Promise<QuoteListItem[]> {
  const quotes = await db.quote.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { customer: { select: { name: true, phone: true } } },
  });

  return quotes.map((q) => ({
    id: q.id,
    customerName: q.customer?.name ?? null,
    customerPhone: q.customer?.phone ?? null,
    dadosColetados: (q.dadosColetados as Record<string, number>) ?? {},
    precoCalculado: Number(q.precoCalculado),
    status: q.status,
    validoAte: q.validoAte,
    createdAt: q.createdAt,
  }));
}

export type PricingRuleListItem = {
  id: string;
  nome: string;
  variavel: string;
  valorUnitario: number;
  obrigatoria: boolean;
  minimo: number | null;
  ativo: boolean;
};

export async function listPricingRules(restaurantId: string): Promise<PricingRuleListItem[]> {
  const rules = await db.pricingRule.findMany({ where: { restaurantId }, orderBy: { nome: "asc" } });
  return rules.map((r) => ({
    id: r.id,
    nome: r.nome,
    variavel: r.variavel,
    valorUnitario: Number(r.valorUnitario),
    obrigatoria: r.obrigatoria,
    minimo: (r.condicao as { minimo?: number } | null)?.minimo ?? null,
    ativo: r.ativo,
  }));
}

export function getQuoteSettings(restaurantId: string) {
  return db.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    select: { quoteAgentNicho: true, quoteFollowUpDias: true, quoteValidadeDias: true },
  });
}
