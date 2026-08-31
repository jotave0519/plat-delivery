import type { PrismaClient } from "../../src/generated/prisma";

/**
 * Adds a couple of example option groups (adicionais) to a few catalog
 * products, if they don't already have one with that name — idempotent, so
 * it's safe both as part of a fresh seed (prisma/seed.ts) and as a one-off
 * against an already-seeded database (prisma/add-sample-options.ts) without
 * duplicating anything.
 */
export async function addSampleOptionGroups(db: PrismaClient, restaurantId: string) {
  const specs: {
    productName: string;
    group: { name: string; required: boolean; multiple: boolean; items: { name: string; price: number }[] };
  }[] = [
    {
      productName: "Burger Veggie",
      group: {
        name: "Adicionais",
        required: false,
        multiple: true,
        items: [
          { name: "Bacon extra", price: 6 },
          { name: "Queijo extra", price: 4 },
          { name: "Molho especial", price: 2 },
        ],
      },
    },
    {
      productName: "Pizza Margherita G",
      group: {
        name: "Borda",
        required: false,
        multiple: false,
        items: [
          { name: "Borda de catupiry", price: 8 },
          { name: "Borda de cheddar", price: 8 },
        ],
      },
    },
  ];

  for (const spec of specs) {
    const product = await db.product.findFirst({ where: { restaurantId, name: spec.productName } });
    if (!product) continue;

    const existingGroup = await db.optionGroup.findFirst({
      where: { productId: product.id, name: spec.group.name },
    });
    if (existingGroup) continue;

    await db.optionGroup.create({
      data: {
        productId: product.id,
        name: spec.group.name,
        required: spec.group.required,
        multiple: spec.group.multiple,
        items: { create: spec.group.items },
      },
    });
  }
}
