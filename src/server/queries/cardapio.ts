import "server-only";

import { db } from "@/lib/db";

export type CardapioProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
  categoryId: string;
  /** Times this product has appeared in a real order — blocks deletion. */
  orderedCount: number;
};

export type CardapioCategory = { id: string; name: string; position: number; products: CardapioProduct[] };

export async function listCategoriesWithProducts(restaurantId: string): Promise<CardapioCategory[]> {
  const categories = await db.category.findMany({
    where: { restaurantId },
    orderBy: { position: "asc" },
    include: {
      products: {
        orderBy: { position: "asc" },
        include: { _count: { select: { orderItems: true } } },
      },
    },
  });

  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    position: c.position,
    products: c.products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: Number(p.price),
      imageUrl: p.imageUrl,
      isAvailable: p.isAvailable,
      categoryId: p.categoryId,
      orderedCount: p._count.orderItems,
    })),
  }));
}

export async function listCategoryOptions(restaurantId: string) {
  return db.category.findMany({
    where: { restaurantId },
    orderBy: { position: "asc" },
    select: { id: true, name: true },
  });
}

export type EditableOptionItem = { id: string; name: string; price: number; usedCount: number };
export type EditableOptionGroup = {
  id: string;
  name: string;
  required: boolean;
  multiple: boolean;
  items: EditableOptionItem[];
};
export type EditableProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
  categoryId: string;
  orderedCount: number;
  optionGroups: EditableOptionGroup[];
};

export async function getProductForEdit(restaurantId: string, productId: string): Promise<EditableProduct | null> {
  const product = await db.product.findFirst({
    where: { id: productId, restaurantId },
    include: {
      _count: { select: { orderItems: true } },
      optionGroups: {
        include: {
          items: { include: { _count: { select: { orderItemOptions: true } } } },
        },
      },
    },
  });
  if (!product) return null;

  return {
    id: product.id,
    name: product.name,
    description: product.description,
    price: Number(product.price),
    imageUrl: product.imageUrl,
    isAvailable: product.isAvailable,
    categoryId: product.categoryId,
    orderedCount: product._count.orderItems,
    optionGroups: product.optionGroups.map((g) => ({
      id: g.id,
      name: g.name,
      required: g.required,
      multiple: g.multiple,
      items: g.items.map((i) => ({
        id: i.id,
        name: i.name,
        price: Number(i.price),
        usedCount: i._count.orderItemOptions,
      })),
    })),
  };
}
