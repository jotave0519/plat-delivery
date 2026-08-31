import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma";
import { env } from "@/lib/env";

// Reuse a single Prisma Client instance across hot reloads in dev so we
// don't exhaust Postgres connections. In production each server instance
// gets its own client.
//
// DATABASE_URL is the runtime connection used by the Prisma Client — in
// production (EasyPanel) it's configured as the Supabase Session pooler
// connection string; locally it's typically the direct connection (works
// fine either way for this single-persistent-container app — see
// .env.example for both formats). Migrations use DIRECT_URL instead
// (prisma.config.ts), always the direct connection since the Prisma CLI
// needs it for schema introspection.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
