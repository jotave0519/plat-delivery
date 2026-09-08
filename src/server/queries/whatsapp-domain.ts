import "server-only";

import { db } from "@/lib/db";

/** The single mutually-exclusive selector shared by PEDIDO/DESPACHO/ORCAMENTO — see src/server/actions/whatsapp-domain.ts. */
export async function getWhatsappAgentDomain(restaurantId: string) {
  const restaurant = await db.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { whatsappAgentDomain: true } });
  return restaurant.whatsappAgentDomain;
}
