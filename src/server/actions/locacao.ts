"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";

/**
 * Agente 5's client-facing Server Actions — Corretor/Imovel CRUD + settings.
 * Fatia 1 only: no candidatura-approval action exists yet (that's fatia 2,
 * gated behind aplicar_criterios_aprovacao, deliberately not built this
 * round). Follows the same "use server" vs "server-only" split established
 * (and required) in Agentes 3/4 — locacao-ia-conversa.ts (the webhook-driven
 * conversational/document-capture logic) is separate and never imported
 * here.
 */

const MANAGER_ROLES = ["OWNER", "ADMIN"];

export async function saveLocacaoSettings(input: { locacaoVisitaDuracaoMin?: number }) {
  const tenant = await getTenant();
  if (!MANAGER_ROLES.includes(tenant.role)) return { error: "Sem permissão para configurar locação." };

  await db.restaurant.update({
    where: { id: tenant.restaurantId },
    data: { locacaoVisitaDuracaoMin: input.locacaoVisitaDuracaoMin && input.locacaoVisitaDuracaoMin > 0 ? input.locacaoVisitaDuracaoMin : undefined },
  });
  revalidatePath("/configuracoes");
}

export async function saveCorretor(input: { id?: string; nome: string; telefone: string; disponivel: boolean }) {
  const tenant = await getTenant();
  if (!MANAGER_ROLES.includes(tenant.role)) return { error: "Sem permissão para configurar corretores." };
  if (!input.nome.trim() || !input.telefone.trim()) return { error: "Nome e telefone são obrigatórios." };

  const data = { nome: input.nome.trim(), telefone: input.telefone.replace(/\D/g, ""), disponivel: input.disponivel };

  if (input.id) {
    const existing = await db.corretor.findFirst({ where: { id: input.id, restaurantId: tenant.restaurantId } });
    if (!existing) return { error: "Corretor não encontrado." };
    await db.corretor.update({ where: { id: input.id }, data });
  } else {
    await db.corretor.create({ data: { restaurantId: tenant.restaurantId, ...data } });
  }
  revalidatePath("/configuracoes");
}

export async function removeCorretor(id: string) {
  const tenant = await getTenant();
  if (!MANAGER_ROLES.includes(tenant.role)) return { error: "Sem permissão para configurar corretores." };

  const existing = await db.corretor.findFirst({ where: { id, restaurantId: tenant.restaurantId } });
  if (!existing) return { error: "Corretor não encontrado." };
  await db.corretor.delete({ where: { id } });
  revalidatePath("/configuracoes");
}

export async function saveImovel(input: {
  id?: string;
  endereco: string;
  valorAluguel: number;
  condicoes?: string;
  fotos: string[];
  corretorId?: string;
  disponivel: boolean;
}) {
  const tenant = await getTenant();
  if (!input.endereco.trim()) return { error: "Endereço é obrigatório." };
  if (!Number.isFinite(input.valorAluguel) || input.valorAluguel <= 0) return { error: "Valor de aluguel inválido." };

  if (input.corretorId) {
    const corretor = await db.corretor.findFirst({ where: { id: input.corretorId, restaurantId: tenant.restaurantId } });
    if (!corretor) return { error: "Corretor não encontrado." };
  }

  const data = {
    endereco: input.endereco.trim(),
    valorAluguel: input.valorAluguel,
    condicoes: input.condicoes?.trim() || null,
    fotos: input.fotos.filter(Boolean),
    corretorId: input.corretorId || null,
    disponivel: input.disponivel,
  };

  if (input.id) {
    const existing = await db.imovel.findFirst({ where: { id: input.id, restaurantId: tenant.restaurantId } });
    if (!existing) return { error: "Imóvel não encontrado." };
    await db.imovel.update({ where: { id: input.id }, data });
  } else {
    await db.imovel.create({ data: { restaurantId: tenant.restaurantId, ...data } });
  }
  revalidatePath("/configuracoes");
  revalidatePath("/candidaturas");
}

export async function removeImovel(id: string) {
  const tenant = await getTenant();
  const existing = await db.imovel.findFirst({ where: { id, restaurantId: tenant.restaurantId } });
  if (!existing) return { error: "Imóvel não encontrado." };

  const emUso = await db.candidatura.findFirst({ where: { imovelId: id } });
  if (emUso) return { error: "Este imóvel já tem candidatura(s) registrada(s) — marque como indisponível em vez de excluir." };

  await db.imovel.delete({ where: { id } });
  revalidatePath("/configuracoes");
}
