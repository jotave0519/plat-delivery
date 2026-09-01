import "server-only";

import { db } from "@/lib/db";

export type PricedOrderItemInput = {
  productId: string;
  quantity: number;
  notes?: string;
  optionItemIds?: string[];
};

export type PricedOrderItem = {
  productId: string;
  quantity: number;
  unitPrice: number;
  notes: string | null;
  options: { create: { optionItemId: string; price: number }[] };
};

/**
 * Re-derives item/option prices from the database for a set of product/
 * option ids — the one place order creation ever computes pricing, shared
 * by the manual order form (src/server/actions/orders.ts) and the WhatsApp
 * agent (src/server/actions/atendimento-ia-conversa.ts), so a client (or
 * the AI) can never supply a price directly, only ids and quantities.
 */
export async function priceOrderItems(
  restaurantId: string,
  items: PricedOrderItemInput[],
): Promise<{ error: string } | { subtotal: number; itemsToCreate: PricedOrderItem[] }> {
  const productIds = [...new Set(items.map((i) => i.productId))];
  const products = await db.product.findMany({
    where: { id: { in: productIds }, restaurantId, isAvailable: true },
    include: { optionGroups: { include: { items: true } } },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  let subtotal = 0;
  const itemsToCreate: PricedOrderItem[] = [];
  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product) return { error: "Um dos produtos não está mais disponível." };

    const allOptionItems = product.optionGroups.flatMap((g) => g.items);
    const selectedOptions = (item.optionItemIds ?? [])
      .map((id) => allOptionItems.find((oi) => oi.id === id))
      .filter((oi): oi is NonNullable<typeof oi> => Boolean(oi));

    const unitPrice = Number(product.price);
    const optionsTotal = selectedOptions.reduce((sum, oi) => sum + Number(oi.price), 0);
    subtotal += (unitPrice + optionsTotal) * item.quantity;

    itemsToCreate.push({
      productId: product.id,
      quantity: item.quantity,
      unitPrice,
      notes: item.notes || null,
      options: { create: selectedOptions.map((oi) => ({ optionItemId: oi.id, price: Number(oi.price) })) },
    });
  }

  return { subtotal, itemsToCreate };
}

/** Next sequential order number for a restaurant — same non-transactional pattern already used everywhere orders are created. */
export async function nextOrderNumber(restaurantId: string): Promise<number> {
  const lastOrder = await db.order.findFirst({
    where: { restaurantId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  return (lastOrder?.number ?? 1000) + 1;
}
