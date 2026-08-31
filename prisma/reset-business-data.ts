import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma";

// Standalone script (not the Next.js process), so load .env the same way
// prisma.config.ts / prisma/seed.ts do.
try {
  process.loadEnvFile(".env");
} catch {
  // no .env file — rely on already-set process.env
}

/**
 * Wipes business data (orders, customers, menu, stock, financial entries)
 * for every restaurant, WITHOUT touching schema/migrations, Restaurant,
 * User, or WhatsappConnection rows. Meant for going from "seeded demo data"
 * to "clean slate ready for real use" — safe to run again later (e.g.
 * before a fresh demo) since it's idempotent (deleting an already-empty
 * table is a no-op).
 *
 * Defaults to a DRY RUN: prints exactly what would be deleted, per table,
 * per restaurant, and does nothing else. Pass --confirm to actually delete.
 *
 *   npx tsx prisma/reset-business-data.ts            (dry run)
 *   npx tsx prisma/reset-business-data.ts --confirm   (actually deletes)
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

const CONFIRM = process.argv.includes("--confirm");

async function countsFor(restaurantId: string) {
  const [
    customer,
    category,
    product,
    optionGroup,
    optionItem,
    order,
    orderItem,
    orderItemOption,
    orderEvent,
    stockItem,
    stockMovement,
    financialEntry,
  ] = await Promise.all([
    db.customer.count({ where: { restaurantId } }),
    db.category.count({ where: { restaurantId } }),
    db.product.count({ where: { restaurantId } }),
    db.optionGroup.count({ where: { product: { restaurantId } } }),
    db.optionItem.count({ where: { group: { product: { restaurantId } } } }),
    db.order.count({ where: { restaurantId } }),
    db.orderItem.count({ where: { order: { restaurantId } } }),
    db.orderItemOption.count({ where: { orderItem: { order: { restaurantId } } } }),
    db.orderEvent.count({ where: { order: { restaurantId } } }),
    db.stockItem.count({ where: { restaurantId } }),
    db.stockMovement.count({ where: { stockItem: { restaurantId } } }),
    db.financialEntry.count({ where: { restaurantId } }),
  ]);
  return { customer, category, product, optionGroup, optionItem, order, orderItem, orderItemOption, orderEvent, stockItem, stockMovement, financialEntry };
}

async function main() {
  const restaurants = await db.restaurant.findMany({ select: { id: true, name: true, slug: true } });
  if (restaurants.length === 0) {
    console.log("Nenhum restaurante encontrado — nada para limpar.");
    return;
  }

  for (const r of restaurants) {
    const before = await countsFor(r.id);
    console.log(`\n=== ${r.name} (${r.slug}) — ${CONFIRM ? "APAGANDO" : "DRY RUN, nada será apagado ainda"} ===`);
    console.table(before);

    if (!CONFIRM) continue;

    // Ordered to respect FK constraints (children before parents). Never
    // touches Restaurant, User, or WhatsappConnection.
    await db.$transaction(async (tx) => {
      await tx.orderItemOption.deleteMany({ where: { orderItem: { order: { restaurantId: r.id } } } });
      await tx.orderEvent.deleteMany({ where: { order: { restaurantId: r.id } } });
      await tx.orderItem.deleteMany({ where: { order: { restaurantId: r.id } } });
      await tx.stockMovement.deleteMany({ where: { stockItem: { restaurantId: r.id } } });
      await tx.order.deleteMany({ where: { restaurantId: r.id } });
      await tx.optionItem.deleteMany({ where: { group: { product: { restaurantId: r.id } } } });
      await tx.optionGroup.deleteMany({ where: { product: { restaurantId: r.id } } });
      await tx.product.deleteMany({ where: { restaurantId: r.id } });
      await tx.category.deleteMany({ where: { restaurantId: r.id } });
      await tx.stockItem.deleteMany({ where: { restaurantId: r.id } });
      await tx.financialEntry.deleteMany({ where: { restaurantId: r.id } });
      await tx.customer.deleteMany({ where: { restaurantId: r.id } });
    });

    const after = await countsFor(r.id);
    console.log(`--- depois da limpeza (${r.name}) ---`);
    console.table(after);
  }

  if (!CONFIRM) {
    console.log("\nDry run apenas — nada foi apagado. Rode de novo com --confirm para executar a limpeza de verdade.");
  } else {
    console.log("\nLimpeza concluída. Restaurant/User/WhatsappConnection não foram tocados.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
