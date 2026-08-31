import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma";
import { env } from "@/lib/env";

// Reuse a single Prisma Client instance across hot reloads in dev so we
// don't exhaust Postgres connections. In production each server instance
// gets its own client.
//
// DATABASE_URL is the pooled connection (Supabase Supavisor, session mode)
// — see .env.example. Migrations use DIRECT_URL instead (prisma.config.ts).
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
