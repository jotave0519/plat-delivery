"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";

const entrySchema = z.object({
  id: z.string().optional(),
  type: z.enum(["RECEITA", "DESPESA"]),
  category: z.string().min(1, "Categoria é obrigatória"),
  amount: z.number().positive("Valor deve ser maior que zero"),
  description: z.string().optional(),
  date: z.string().min(1, "Informe a data"),
});

export type SaveFinancialEntryInput = z.infer<typeof entrySchema>;

export async function saveFinancialEntry(input: SaveFinancialEntryInput) {
  const tenant = await getTenant();
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const data = parsed.data;

  // Noon avoids the date shifting to the previous day when converted
  // to/from UTC for storage.
  const date = new Date(`${data.date}T12:00:00`);
  if (Number.isNaN(date.getTime())) return { error: "Data inválida." };

  const entryData = {
    type: data.type,
    category: data.category.trim(),
    amount: data.amount,
    description: data.description?.trim() || null,
    date,
  };

  if (data.id) {
    const existing = await db.financialEntry.findFirst({ where: { id: data.id, restaurantId: tenant.restaurantId } });
    if (!existing) return { error: "Lançamento não encontrado." };
    await db.financialEntry.update({ where: { id: data.id }, data: entryData });
  } else {
    await db.financialEntry.create({ data: { ...entryData, restaurantId: tenant.restaurantId } });
  }

  revalidatePath("/financeiro");
}

export async function deleteFinancialEntry(id: string) {
  const tenant = await getTenant();
  const entry = await db.financialEntry.findFirst({ where: { id, restaurantId: tenant.restaurantId } });
  if (!entry) return { error: "Lançamento não encontrado." };

  await db.financialEntry.delete({ where: { id } });
  revalidatePath("/financeiro");
}
