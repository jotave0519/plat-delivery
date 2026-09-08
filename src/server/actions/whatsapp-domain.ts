"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";

const MANAGER_ROLES = ["OWNER", "ADMIN"];

/**
 * Which WhatsApp conversational domain a tenant runs — PEDIDO (Cardápio/
 * pedidos), DESPACHO (Agente 3), ORCAMENTO (Agente 4), or LOCACAO
 * (Agente 5). Mutually exclusive by construction (Restaurant.
 * whatsappAgentDomain), so this lives in its own neutral file rather than
 * inside despacho.ts/orcamento.ts/locacao.ts — no single agent "owns" this
 * setting, and importing it from one agent's settings form into another's
 * would be backwards.
 */
export async function saveWhatsappAgentDomain(domain: "PEDIDO" | "DESPACHO" | "ORCAMENTO" | "LOCACAO") {
  const tenant = await getTenant();
  if (!MANAGER_ROLES.includes(tenant.role)) return { error: "Sem permissão para configurar o agente de WhatsApp." };

  await db.restaurant.update({ where: { id: tenant.restaurantId }, data: { whatsappAgentDomain: domain } });
  revalidatePath("/configuracoes");
  revalidatePath("/despacho");
  revalidatePath("/orcamentos");
  revalidatePath("/candidaturas");
}
