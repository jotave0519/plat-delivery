"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";

function revalidateCardapio() {
  revalidatePath("/cardapio");
  revalidatePath("/dashboard");
  revalidatePath("/pedidos/novo");
}

// ---------- categories ----------

const categorySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Nome é obrigatório"),
});

export async function saveCategory(input: z.infer<typeof categorySchema>) {
  const tenant = await getTenant();
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const data = parsed.data;

  if (data.id) {
    const existing = await db.category.findFirst({ where: { id: data.id, restaurantId: tenant.restaurantId } });
    if (!existing) return { error: "Categoria não encontrada." };
    await db.category.update({ where: { id: data.id }, data: { name: data.name } });
  } else {
    const last = await db.category.findFirst({
      where: { restaurantId: tenant.restaurantId },
      orderBy: { position: "desc" },
    });
    await db.category.create({
      data: { restaurantId: tenant.restaurantId, name: data.name, position: (last?.position ?? -1) + 1 },
    });
  }
  revalidateCardapio();
}

/**
 * Swaps a category with its neighbor. Also normalizes every category's
 * `position` to a clean sequential order first — the seed never set
 * distinct positions, so without this, everything ties at 0 and swapping
 * has no visible effect the first time someone reorders.
 */
export async function moveCategory(categoryId: string, direction: "up" | "down") {
  const tenant = await getTenant();
  const categories = await db.category.findMany({
    where: { restaurantId: tenant.restaurantId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });

  const index = categories.findIndex((c) => c.id === categoryId);
  if (index === -1) return;
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= categories.length) return;

  const a = categories[index];
  const b = categories[swapWith];

  // Positions might not be distinct yet (the seed never set them) — the
  // first reorder ever normalizes everyone to a clean sequential order.
  // After that, positions stay unique and this is skipped, so a swap is
  // just 2 writes instead of rewriting every category every time.
  const needsNormalization = categories.some((c, i) => c.position !== i);
  if (needsNormalization) {
    await db.$transaction(categories.map((c, i) => db.category.update({ where: { id: c.id }, data: { position: i } })));
    a.position = index;
    b.position = swapWith;
  }

  await db.$transaction([
    db.category.update({ where: { id: a.id }, data: { position: b.position } }),
    db.category.update({ where: { id: b.id }, data: { position: a.position } }),
  ]);
  revalidateCardapio();
}

export async function deleteCategory(categoryId: string) {
  const tenant = await getTenant();
  const category = await db.category.findFirst({
    where: { id: categoryId, restaurantId: tenant.restaurantId },
    include: { _count: { select: { products: true } } },
  });
  if (!category) return { error: "Categoria não encontrada." };
  if (category._count.products > 0) {
    return { error: "Só é possível excluir categorias sem produtos." };
  }
  await db.category.delete({ where: { id: categoryId } });
  revalidateCardapio();
}

// ---------- products ----------

export async function toggleProductAvailability(productId: string) {
  const tenant = await getTenant();
  const product = await db.product.findFirst({
    where: { id: productId, restaurantId: tenant.restaurantId },
    select: { id: true, isAvailable: true },
  });
  if (!product) return;
  await db.product.update({ where: { id: product.id }, data: { isAvailable: !product.isAvailable } });
  revalidateCardapio();
}

export async function deleteProduct(productId: string) {
  const tenant = await getTenant();
  const product = await db.product.findFirst({
    where: { id: productId, restaurantId: tenant.restaurantId },
    include: { _count: { select: { orderItems: true } } },
  });
  if (!product) return { error: "Produto não encontrado." };
  if (product._count.orderItems > 0) {
    return { error: "Este produto já foi usado em pedidos — pause em vez de excluir." };
  }
  await db.product.delete({ where: { id: productId } });
  revalidateCardapio();
  redirect("/cardapio");
}

const optionItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  price: z.number().min(0),
});
const optionGroupSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  required: z.boolean(),
  multiple: z.boolean(),
  items: z.array(optionItemSchema),
});
const productSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional(),
  price: z.number().min(0),
  imageUrl: z.string().optional(),
  categoryId: z.string().min(1, "Selecione uma categoria"),
  isAvailable: z.boolean(),
  optionGroups: z.array(optionGroupSchema),
});

export type SaveProductInput = z.infer<typeof productSchema>;

/**
 * Upserts a product and diffs its option groups/items against the form
 * payload: updates what has an id, creates what doesn't, deletes what's no
 * longer there. A group/item ever used in a real order is never deleted
 * (OrderItem/OrderItemOption reference it without cascade, on purpose —
 * it's order history) — the delete is attempted and silently skipped if the
 * database rejects it, as a server-side backstop to the same rule the UI
 * already enforces (see getProductForEdit's `usedCount`/`orderedCount`).
 */
export async function saveProduct(input: SaveProductInput) {
  const tenant = await getTenant();
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const data = parsed.data;

  const category = await db.category.findFirst({
    where: { id: data.categoryId, restaurantId: tenant.restaurantId },
  });
  if (!category) return { error: "Categoria inválida." };

  const productData = {
    restaurantId: tenant.restaurantId,
    categoryId: data.categoryId,
    name: data.name,
    description: data.description?.trim() || null,
    price: data.price,
    imageUrl: data.imageUrl?.trim() || null,
    isAvailable: data.isAvailable,
  };

  let productId: string;
  if (data.id) {
    const existing = await db.product.findFirst({ where: { id: data.id, restaurantId: tenant.restaurantId } });
    if (!existing) return { error: "Produto não encontrado." };
    await db.product.update({ where: { id: data.id }, data: productData });
    productId = data.id;
  } else {
    const created = await db.product.create({ data: productData });
    productId = created.id;
  }

  // Existing groups/items actually owned by this (tenant-verified) product
  // — the only source of truth for which client-supplied ids are safe to
  // act on. `OptionGroup`/`OptionItem` have no restaurantId of their own
  // (only reachable transitively via productId), so without this check a
  // crafted id belonging to a different product — even a different
  // tenant's — would get silently updated below.
  const existingGroups = await db.optionGroup.findMany({
    where: { productId },
    include: { items: { include: { _count: { select: { orderItemOptions: true } } } } },
  });
  const existingGroupIds = new Set(existingGroups.map((g) => g.id));
  const existingItemIds = new Set(existingGroups.flatMap((g) => g.items.map((i) => i.id)));

  for (const group of data.optionGroups) {
    if (group.id && !existingGroupIds.has(group.id)) return { error: "Grupo de adicional inválido." };
    for (const item of group.items) {
      if (item.id && !existingItemIds.has(item.id)) return { error: "Item de adicional inválido." };
    }
  }

  const incomingGroupIds = new Set(data.optionGroups.flatMap((g) => (g.id ? [g.id] : [])));
  const incomingItemIds = new Set(data.optionGroups.flatMap((g) => g.items.flatMap((i) => (i.id ? [i.id] : []))));

  // Dropped from the form get deleted, unless used in a real order (kept
  // as history — see the note on saveProduct above).
  const groupIdsToDelete = existingGroups
    .filter((g) => !incomingGroupIds.has(g.id) && !g.items.some((i) => i._count.orderItemOptions > 0))
    .map((g) => g.id);
  const itemIdsToDelete = existingGroups
    .flatMap((g) => g.items)
    .filter((i) => !incomingItemIds.has(i.id) && i._count.orderItemOptions === 0)
    .map((i) => i.id);

  // All of the diff below — deletes, updates, and the sequential creates
  // that need a freshly-created group's id for its items — runs as one
  // atomic transaction. Previously these were several independent
  // deleteMany/createMany/$transaction calls: a crash or connection drop
  // partway through (e.g. after deleting a dropped group but before the new
  // groups/items were created) could leave the product's adicionais in a
  // half-written state. An interactive transaction (not just a batch array)
  // is required here because creating new groups and reading back their
  // generated id, to attach items, has to happen sequentially.
  const groupsToUpdate = data.optionGroups.filter((g) => g.id);
  await db.$transaction(async (tx) => {
    if (groupIdsToDelete.length > 0) await tx.optionGroup.deleteMany({ where: { id: { in: groupIdsToDelete } } });
    if (itemIdsToDelete.length > 0) await tx.optionItem.deleteMany({ where: { id: { in: itemIdsToDelete } } });

    for (const g of groupsToUpdate) {
      await tx.optionGroup.update({ where: { id: g.id! }, data: { name: g.name, required: g.required, multiple: g.multiple } });
    }

    // Create the new groups (sequential: each new group's id is needed
    // right after, to attach its items).
    const resolvedGroups: { groupId: string; items: SaveProductInput["optionGroups"][number]["items"] }[] = [];
    for (const group of data.optionGroups) {
      if (group.id) {
        resolvedGroups.push({ groupId: group.id, items: group.items });
      } else {
        const created = await tx.optionGroup.create({
          data: { productId, name: group.name, required: group.required, multiple: group.multiple },
        });
        resolvedGroups.push({ groupId: created.id, items: group.items });
      }
    }

    const itemsToUpdate = resolvedGroups.flatMap(({ items }) => items.filter((i) => i.id));
    for (const i of itemsToUpdate) {
      await tx.optionItem.update({ where: { id: i.id! }, data: { name: i.name, price: i.price } });
    }

    const itemsToCreate = resolvedGroups.flatMap(({ groupId, items }) =>
      items.filter((i) => !i.id).map((i) => ({ groupId, name: i.name, price: i.price })),
    );
    if (itemsToCreate.length > 0) {
      await tx.optionItem.createMany({ data: itemsToCreate });
    }
  });

  revalidateCardapio();
  redirect("/cardapio");
}
