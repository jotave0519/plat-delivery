"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import { Prisma } from "@/generated/prisma";

const customerSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Nome é obrigatório"),
  phone: z.string().min(8, "Telefone inválido"),
  address: z.string().optional(),
  notes: z.string().optional(),
});

export type SaveCustomerInput = z.infer<typeof customerSchema>;

export async function saveCustomer(input: SaveCustomerInput) {
  const tenant = await getTenant();
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const data = parsed.data;

  const customerData = {
    name: data.name.trim(),
    phone: data.phone.trim(),
    address: data.address?.trim() || null,
    notes: data.notes?.trim() || null,
  };

  try {
    let customerId: string;
    if (data.id) {
      const existing = await db.customer.findFirst({ where: { id: data.id, restaurantId: tenant.restaurantId } });
      if (!existing) return { error: "Cliente não encontrado." };
      await db.customer.update({ where: { id: data.id }, data: customerData });
      customerId = data.id;
    } else {
      const created = await db.customer.create({ data: { ...customerData, restaurantId: tenant.restaurantId } });
      customerId = created.id;
    }
    revalidatePath("/clientes");
    revalidatePath(`/clientes/${customerId}`);
    return { id: customerId };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "Já existe um cliente com esse telefone." };
    }
    throw err;
  }
}

export async function deleteCustomer(customerId: string) {
  const tenant = await getTenant();
  const customer = await db.customer.findFirst({
    where: { id: customerId, restaurantId: tenant.restaurantId },
    include: { _count: { select: { orders: true } } },
  });
  if (!customer) return { error: "Cliente não encontrado." };
  if (customer._count.orders > 0) {
    return { error: "Este cliente já tem pedidos — não pode ser excluído." };
  }
  await db.customer.delete({ where: { id: customerId } });
  revalidatePath("/clientes");
  redirect("/clientes");
}
