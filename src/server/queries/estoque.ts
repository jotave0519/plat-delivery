import "server-only";

import { db } from "@/lib/db";

export type StockStatus = "ESGOTADO" | "BAIXO" | "OK";

export function stockStatus(quantityOnHand: number, minQuantity: number): StockStatus {
  if (quantityOnHand <= 0) return "ESGOTADO";
  if (quantityOnHand <= minQuantity) return "BAIXO";
  return "OK";
}

const SEVERITY_ORDER: Record<StockStatus, number> = { ESGOTADO: 0, BAIXO: 1, OK: 2 };

export type StockItemListEntry = {
  id: string;
  name: string;
  unit: string;
  quantityOnHand: number;
  minQuantity: number;
  status: StockStatus;
};

/** Sorted so what needs attention (esgotado, then baixo) always floats to the top. */
export async function listStockItems(restaurantId: string): Promise<StockItemListEntry[]> {
  const items = await db.stockItem.findMany({ where: { restaurantId }, orderBy: { name: "asc" } });

  return items
    .map((i) => {
      const quantityOnHand = Number(i.quantityOnHand);
      const minQuantity = Number(i.minQuantity);
      return { id: i.id, name: i.name, unit: i.unit, quantityOnHand, minQuantity, status: stockStatus(quantityOnHand, minQuantity) };
    })
    .sort((a, b) => SEVERITY_ORDER[a.status] - SEVERITY_ORDER[b.status] || a.name.localeCompare(b.name));
}

export type StockMovementEntry = { id: string; type: "ENTRADA" | "SAIDA"; quantity: number; reason: string | null; createdAt: Date };

export type StockItemDetail = {
  id: string;
  name: string;
  unit: string;
  quantityOnHand: number;
  minQuantity: number;
  status: StockStatus;
  movements: StockMovementEntry[];
};

export async function getStockItemDetail(restaurantId: string, id: string): Promise<StockItemDetail | null> {
  const item = await db.stockItem.findFirst({
    where: { id, restaurantId },
    include: { movements: { orderBy: { createdAt: "desc" } } },
  });
  if (!item) return null;

  const quantityOnHand = Number(item.quantityOnHand);
  const minQuantity = Number(item.minQuantity);

  return {
    id: item.id,
    name: item.name,
    unit: item.unit,
    quantityOnHand,
    minQuantity,
    status: stockStatus(quantityOnHand, minQuantity),
    movements: item.movements.map((m) => ({
      id: m.id,
      type: m.type,
      quantity: Number(m.quantity),
      reason: m.reason,
      createdAt: m.createdAt,
    })),
  };
}
