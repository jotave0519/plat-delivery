"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import { calcularPreco } from "@/server/orcamento/pricing";
import { enviarOrcamentoPdfWhatsapp } from "@/server/actions/orcamento-dispatch";
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

/**
 * Manual quote creation — for a tenant that doesn't want the AI conversing
 * automatically on WhatsApp: whoever is at the counter types the collected
 * data in themselves. Reuses calcularPreco (same "preço nunca decidido
 * livremente" guardrail as the automated path in orcamento-ia-conversa.ts) —
 * this only skips the AI conversation step, never the pricing engine.
 */
export async function criarOrcamentoManual(input: {
  customerName?: string;
  customerPhone?: string;
  dadosColetados: Record<string, number>;
}) {
  const tenant = await getTenant();
  if (!MANAGER_ROLES.includes(tenant.role)) return { error: "Sem permissão para criar orçamentos." };

  const priced = await calcularPreco(tenant.restaurantId, input.dadosColetados);
  if ("error" in priced) return { error: priced.error, faltando: priced.faltando };

  const restaurant = await db.restaurant.findUniqueOrThrow({
    where: { id: tenant.restaurantId },
    select: { quoteValidadeDias: true },
  });

  let customerId: string | undefined;
  const phone = input.customerPhone?.trim();
  if (phone) {
    const existing = await db.customer.findFirst({ where: { restaurantId: tenant.restaurantId, phone } });
    const customer =
      existing ??
      (await db.customer.create({
        data: { restaurantId: tenant.restaurantId, name: input.customerName?.trim() || "Cliente sem nome", phone },
      }));
    customerId = customer.id;
  }

  const validoAte = new Date(Date.now() + restaurant.quoteValidadeDias * 24 * 60 * 60 * 1000);
  const quote = await db.quote.create({
    data: {
      restaurantId: tenant.restaurantId,
      customerId,
      dadosColetados: input.dadosColetados,
      precoCalculado: priced.total,
      status: "ENVIADO",
      validoAte,
    },
  });

  revalidatePath("/orcamentos");
  return { id: quote.id, total: priced.total, detalhamento: priced.detalhamento, validoAte };
}

/** Sends an already-created manual quote as a WhatsApp PDF (see criarOrcamentoManual). */
export async function enviarOrcamentoManualPdf(quoteId: string) {
  const tenant = await getTenant();
  if (!MANAGER_ROLES.includes(tenant.role)) return { error: "Sem permissão para enviar orçamentos." };

  const quote = await db.quote.findFirst({
    where: { id: quoteId, restaurantId: tenant.restaurantId },
    include: { customer: true },
  });
  if (!quote) return { error: "Orçamento não encontrado." };
  if (!quote.customer?.phone) return { error: "Este orçamento não tem telefone de cliente associado." };

  const connection = await db.whatsappConnection.findUnique({ where: { restaurantId: tenant.restaurantId } });
  if (!connection || connection.status !== "CONNECTED") return { error: "Nenhum número de WhatsApp conectado para este negócio." };

  const [restaurant, priced] = await Promise.all([
    db.restaurant.findUniqueOrThrow({ where: { id: tenant.restaurantId }, select: { name: true } }),
    calcularPreco(tenant.restaurantId, quote.dadosColetados as Record<string, number>),
  ]);
  if ("error" in priced) return { error: priced.error };

  await enviarOrcamentoPdfWhatsapp({
    restaurantId: tenant.restaurantId,
    phoneNumber: quote.customer.phone,
    instanceName: connection.instanceName,
    customerId: quote.customer.id,
    restaurantName: restaurant.name,
    customerName: quote.customer.name,
    detalhamento: priced.detalhamento,
    total: priced.total,
    validoAte: quote.validoAte,
  });

  revalidatePath("/orcamentos");
  return { ok: true };
}

/** Rescue path for the queue UI — e.g. the customer accepted by phone call instead of WhatsApp. */
export async function marcarOrcamentoManualmente(quoteId: string, status: QuoteStatus) {
  const tenant = await getTenant();
  const quote = await db.quote.findFirst({ where: { id: quoteId, restaurantId: tenant.restaurantId } });
  if (!quote) return { error: "Orçamento não encontrado." };

  await db.quote.update({ where: { id: quoteId }, data: { status } });
  revalidatePath("/orcamentos");
}
