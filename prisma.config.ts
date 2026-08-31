import { defineConfig, env } from "prisma/config";

// prisma.config.ts runs outside the Next.js process (CLI, seed script), so
// .env isn't loaded automatically the way it is for `next dev`/`next build`.
// In production (EasyPanel/Docker) there is no .env file at all — env vars
// come straight from the container — so a missing file here is expected,
// not an error.
try {
  process.loadEnvFile(".env");
} catch {
  // no .env file — rely on already-set process.env (production containers)
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  // The Prisma CLI (migrate/introspect) uses DIRECT_URL — a non-pooled
  // connection, required for the shadow database `migrate dev` creates and
  // for DDL. The app itself never reads this; see src/lib/db.ts for the
  // pooled DATABASE_URL used at runtime.
  datasource: {
    url: env("DIRECT_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
