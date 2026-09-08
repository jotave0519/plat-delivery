"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import type { QuoteStatus } from "@/generated/prisma";

/**
 * Agente 4's client-facing Server Actions — settings + PricingRule CRUD +
 * the manual queue rescue action. Mirrors the "use server" vs "server-only"
 * split established (and required, after a real bug) in Agente 3:
 * everything that sends WhatsApp messages or runs the pricing engine lives
 * in orcamento-dispatch.ts/orcamento/pricing.ts instead, never mixed here.
 */

const MANAGER_ROLES = ["OWNER", "ADMIN"];

export async function saveQuoteSettings(input: { quoteAgentNicho?: string; quoteFollowUpDias?: number; quoteValidadeDias?: number }) {
  const tenant = await getTenant();
  if (!MANAGER_ROLES.includes(tenant.role)) return { error: "Sem permissão para configurar o orçamento." };

  await db.restaurant.update({
    where: { id: tenant.restaurantId },
    data: {
      quoteAgentNicho: input.quoteAgentNicho?.trim() || null,
      quoteFollowUpDias: input.quoteFollowUpDias && input.quoteFollowUpDias > 0 ? input.quoteFollowUpDias : undefined,
      quoteValidadeDias: input.quoteValidadeDias && input.quoteValidadeDias > 0 ? input.quoteValidadeDias : undefined,
    },
  });
  revalidatePath("/configuracoes");
  revalidatePath("/orcamentos");
}

export async function savePricingRule(input: {
  id?: string;
  nome: string;
  variavel: string;
  valorUnitario: number;
  obrigatoria: boolean;
  minimo?: number;
  ativo: boolean;
}) {
  const tenant = await getTenant();
  if (!MANAGER_ROLES.includes(tenant.role)) return { error: "Sem permissão para configurar regras de preço." };
  if (!input.nome.trim() || !input.variavel.trim()) return { error: "Nome e variável são obrigatórios." };
  if (!Number.isFinite(input.valorUnitario) || input.valorUnitario < 0) return { error: "Valor unitário inválido." };

  const data = {
    nome: input.nome.trim(),
    variavel: input.variavel.trim(),
    valorUnitario: input.valorUnitario,
    obrigatoria: input.obrigatoria,
    condicao: input.minimo != null && input.minimo > 0 ? { minimo: input.minimo } : undefined,
    ativo: input.ativo,
  };

  if (input.id) {
    const existing = await db.pricingRule.findFirst({ where: { id: input.id, restaurantId: tenant.restaurantId } });
    if (!existing) return { error: "Regra não encontrada." };
    await db.pricingRule.update({ where: { id: input.id }, data });
  } else {
    await db.pricingRule.create({ data: { restaurantId: tenant.restaurantId, ...data } });
  }
  revalidatePath("/configuracoes");
}

export async function removePricingRule(id: string) {
  const tenant = await getTenant();
  if (!MANAGER_ROLES.includes(tenant.role)) return { error: "Sem permissão para configurar regras de preço." };

  const existing = await db.pricingRule.findFirst({ where: { id, restaurantId: tenant.restaurantId } });
  if (!existing) return { error: "Regra não encontrada." };
  await db.pricingRule.delete({ where: { id } });
  revalidatePath("/configuracoes");
}

/** Rescue path for the queue UI — e.g. the customer accepted by phone call instead of WhatsApp. */
export async function marcarOrcamentoManualmente(quoteId: string, status: QuoteStatus) {
  const tenant = await getTenant();
  const quote = await db.quote.findFirst({ where: { id: quoteId, restaurantId: tenant.restaurantId } });
  if (!quote) return { error: "Orçamento não encontrado." };

  await db.quote.update({ where: { id: quoteId }, data: { status } });
  revalidatePath("/orcamentos");
}
