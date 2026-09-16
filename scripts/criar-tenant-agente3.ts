import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma";

// Standalone script (not the Next.js process) — load .env the same way
// prisma/seed.ts does.
try {
  process.loadEnvFile(".env");
} catch {
  // no .env file — rely on already-set process.env
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

// ---------- ajuste antes de rodar ----------
const SLUG = "agente3-demo";
const NOME_TENANT = "Agente 3 — Demo";
const OWNER_EMAIL = "joao@agente3-demo.com.br";
const OWNER_SENHA = "senha123"; // troque depois de logar, se quiser
const TELEFONE_ESCALACAO = "11999999999"; // <-- troque pelo seu WhatsApp real, sem isso o alerta de "sem técnico disponível" não tem pra quem ir

async function main() {
  const restaurant = await db.restaurant.upsert({
    where: { slug: SLUG },
    update: {},
    create: {
      name: NOME_TENANT,
      slug: SLUG,
      aiEnabled: true,
      whatsappAgentDomain: "DESPACHO",
      despachoEscalationPhone: TELEFONE_ESCALACAO,
      despachoOfertaTimeoutMinutos: 5,
    },
  });

  const passwordHash = await bcrypt.hash(OWNER_SENHA, 10);
  await db.user.upsert({
    where: { email: OWNER_EMAIL },
    update: {},
    create: {
      restaurantId: restaurant.id,
      name: "João (demo Agente 3)",
      email: OWNER_EMAIL,
      passwordHash,
      role: "OWNER",
    },
  });

  const tecnicosSpec = [
    { nome: "Marcos (elétrica)", telefone: "11988887777", especialidades: ["eletrica"], regioes: ["Zona Leste"] },
    { nome: "Renata (hidráulica/desentupimento)", telefone: "11977776666", especialidades: ["hidraulica", "desentupimento"], regioes: ["Zona Leste", "Centro"] },
  ];
  for (const t of tecnicosSpec) {
    const existente = await db.tecnicoDisponibilidade.findFirst({
      where: { restaurantId: restaurant.id, nome: t.nome },
    });
    if (!existente) {
      await db.tecnicoDisponibilidade.create({
        data: { restaurantId: restaurant.id, ...t, disponivel: true },
      });
    }
  }

  console.log(`Tenant "${restaurant.name}" pronto (slug: ${restaurant.slug}).`);
  console.log(`Login: ${OWNER_EMAIL} / ${OWNER_SENHA}`);
  console.log(
    "Ainda falta: conectar um número de WhatsApp próprio pra esse tenant via Evolution API " +
      "pra testar a conversa de verdade — sem isso dá pra ver a tela de Despacho e cadastrar " +
      "técnicos, mas não dá pra simular um chamado chegando por mensagem real.",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
