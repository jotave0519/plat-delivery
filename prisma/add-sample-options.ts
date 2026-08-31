/**
 * One-off maintenance script — NOT part of `npm run db:seed`.
 *
 * Adds the same example option groups (adicionais) that prisma/seed.ts adds
 * on a fresh database, but safely against a database that has already been
 * seeded (idempotent — see prisma/lib/sample-options.ts), without
 * re-running (and duplicating) the rest of the seed data.
 *
 * Usage: npx tsx prisma/add-sample-options.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma";
import { addSampleOptionGroups } from "./lib/sample-options";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env file — rely on already-set process.env
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

async function main() {
  const restaurant = await db.restaurant.findUniqueOrThrow({ where: { slug: "casa-bonfim" } });
  await addSampleOptionGroups(db, restaurant.id);
  console.log("Adicionais de exemplo adicionados (ou já existiam) para", restaurant.name);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
