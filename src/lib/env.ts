import "server-only";
import { z } from "zod";

/**
 * Validates process.env once, at first import, so a missing/misconfigured
 * variable fails fast and loudly instead of surfacing as a confusing
 * runtime error deep inside a query or the Evolution API client.
 *
 * Required vars are the ones the app cannot run without. The Evolution API
 * vars are optional on purpose — the integration isn't wired up yet (see
 * src/server/integrations/evolution/), so the app must keep working
 * without them until that credential is actually provided.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória (conexão pooled do Postgres)"),
  DIRECT_URL: z.string().min(1, "DIRECT_URL é obrigatória (conexão direta, usada pelo Prisma CLI)"),
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET é obrigatória (sessão do Auth.js)"),

  EVOLUTION_API_URL: z.string().url("EVOLUTION_API_URL deve ser uma URL válida").optional(),
  EVOLUTION_API_KEY: z.string().min(1).optional(),
  EVOLUTION_WEBHOOK_SECRET: z.string().min(1).optional(),

  // URL pública onde este app roda (sem barra final) — usada só para montar a
  // webhook URL que a Evolution API chama de volta. Opcional porque nem todo
  // ambiente (dev local) tem uma URL pública real; sem ela, conectar o
  // WhatsApp retorna um erro amigável em vez de cadastrar um webhook quebrado.
  APP_URL: z.string().url("APP_URL deve ser uma URL válida (ex.: https://seu-dominio.com)").optional(),

  // Usada só pela importação de cardápio por IA (ver
  // src/server/integrations/anthropic/). Opcional pelo mesmo motivo que as
  // vars da Evolution API: sem ela, o botão "Importar cardápio" mostra um
  // erro amigável em vez de quebrar o app inteiro no boot.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Variáveis de ambiente inválidas ou ausentes:", parsed.error.flatten().fieldErrors);
    throw new Error("Configuração de ambiente inválida — confira .env.example");
  }
  return parsed.data;
}

export const env = loadEnv();

/** True once the Evolution API integration has real credentials configured. */
export const isEvolutionApiConfigured = Boolean(env.EVOLUTION_API_URL && env.EVOLUTION_API_KEY);

/** True once the menu-import-by-AI feature has a real API key configured. */
export const isMenuImportConfigured = Boolean(env.ANTHROPIC_API_KEY);
