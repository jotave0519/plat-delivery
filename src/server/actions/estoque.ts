"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";

function revalidateEstoque(id?: string) {
  revalidatePath("/estoque");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/estoque/${id}`);
}

const stockItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Nome é obrigatório"),
  unit: z.string().min(1, "Informe a unidade (ex.: kg, un, L)"),
  minQuantity: z.number().min(0),
  /** Only used on create — quantityOnHand afterwards only changes via recordMovement. */
  quantityOnHand: z.number().min(0).optional(),
});

export type SaveStockItemInput = z.infer<typeof stockItemSchema>;

export async function saveStockItem(input: SaveStockItemInput) {
  const tenant = await getTenant();
  const parsed = stockItemSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const data = parsed.data;

  let itemId: string;
  if (data.id) {
    const existing = await db.stockItem.findFirst({ where: { id: data.id, restaurantId: tenant.restaurantId } });
    if (!existing) return { error: "Item não encontrado." };
    await db.stockItem.update({
      where: { id: data.id },
      data: { name: data.name, unit: data.unit, minQuantity: data.minQuantity },
    });
    itemId = data.id;
  } else {
    const created = await db.stockItem.create({
      data: {
        restaurantId: tenant.restaurantId,
        name: data.name,
        unit: data.unit,
        minQuantity: data.minQuantity,
        quantityOnHand: data.quantityOnHand ?? 0,
      },
    });
    itemId = created.id;
  }

  revalidateEstoque(itemId);
  return { id: itemId };
}

const movementSchema = z.object({
  stockItemId: z.string().min(1),
  type: z.enum(["ENTRADA", "SAIDA"]),
  quantity: z.number().positive("Quantidade deve ser maior que zero"),
  reason: z.string().optional(),
});

export type RecordMovementInput = z.infer<typeof movementSchema>;

export async function recordMovement(input: RecordMovementInput) {
  const tenant = await getTenant();
  const parsed = movementSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const data = parsed.data;

  const item = await db.stockItem.findFirst({ where: { id: data.stockItemId, restaurantId: tenant.restaurantId } });
  if (!item) return { error: "Item não encontrado." };

  const current = Number(item.quantityOnHand);
  const delta = data.type === "ENTRADA" ? data.quantity : -data.quantity;
  const next = current + delta;
  if (next < 0) {
    return { error: `Estoque insuficiente — só há ${current} ${item.unit} disponível.` };
  }

  await db.$transaction([
    db.stockItem.update({ where: { id: item.id }, data: { quantityOnHand: next } }),
    db.stockMovement.create({
      data: { stockItemId: item.id, type: data.type, quantity: data.quantity, reason: data.reason?.trim() || null },
    }),
  ]);

  revalidateEstoque(item.id);
}

export async function deleteStockItem(id: string) {
  const tenant = await getTenant();
  const item = await db.stockItem.findFirst({ where: { id, restaurantId: tenant.restaurantId } });
  if (!item) return { error: "Item não encontrado." };

  await db.stockItem.delete({ where: { id } });
  revalidateEstoque();
  redirect("/estoque");
}
