"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import { Prisma } from "@/generated/prisma";
import { WEEKDAYS, type OpeningHours } from "@/lib/opening-hours";

const MANAGER_ROLES = ["OWNER", "ADMIN"];

const restaurantInfoSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  phone: z.string().optional(),
  address: z.string().optional(),
  pixKey: z.string().optional(),
});

export async function saveRestaurantInfo(input: z.infer<typeof restaurantInfoSchema>) {
  const tenant = await getTenant();
  if (!MANAGER_ROLES.includes(tenant.role)) return { error: "Sem permissão para editar os dados do restaurante." };

  const parsed = restaurantInfoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const data = parsed.data;

  await db.restaurant.update({
    where: { id: tenant.restaurantId },
    data: {
      name: data.name.trim(),
      phone: data.phone?.trim() || null,
      address: data.address?.trim() || null,
      pixKey: data.pixKey?.trim() || null,
    },
  });
  revalidatePath("/configuracoes");
}

/** Restaurant-wide toggle for the new-order notification chime (src/lib/notification-sound.ts) — doesn't affect whether orders are created/notified in-app, only whether the sound plays. */
export async function saveNotificationSettings(input: { orderSoundEnabled: boolean }) {
  const tenant = await getTenant();
  if (!MANAGER_ROLES.includes(tenant.role)) return { error: "Sem permissão para editar as notificações." };

  await db.restaurant.update({
    where: { id: tenant.restaurantId },
    data: { orderSoundEnabled: input.orderSoundEnabled },
  });
  revalidatePath("/configuracoes");
}

const dayHoursSchema = z.object({ open: z.string(), close: z.string(), closed: z.boolean() });
const openingHoursSchema = z.object(
  Object.fromEntries(WEEKDAYS.map((d) => [d, dayHoursSchema])),
) as unknown as z.ZodType<OpeningHours>;

export async function saveOpeningHours(hours: OpeningHours) {
  const tenant = await getTenant();
  if (!MANAGER_ROLES.includes(tenant.role)) return { error: "Sem permissão para editar o horário de funcionamento." };

  const parsed = openingHoursSchema.safeParse(hours);
  if (!parsed.success) return { error: "Horário inválido." };

  await db.restaurant.update({
    where: { id: tenant.restaurantId },
    data: { openingHours: parsed.data as Prisma.InputJsonValue },
  });
  revalidatePath("/configuracoes");
}

const aiSettingsSchema = z.object({
  aiEnabled: z.boolean(),
  faqText: z.string().optional(),
  deliveryAreasText: z.string().optional(),
  defaultDeliveryFee: z.number().min(0).max(500).optional(),
  acceptedPaymentMethods: z.array(z.enum(["PIX", "CARTAO", "DINHEIRO", "VALE_REFEICAO"])).min(1, "Selecione pelo menos uma forma de pagamento."),
});

/** Atendimento IA settings — FAQ, delivery areas, default fee, accepted payment methods, and the master on/off toggle. */
export async function saveAiSettings(input: z.infer<typeof aiSettingsSchema>) {
  const tenant = await getTenant();
  if (!MANAGER_ROLES.includes(tenant.role)) return { error: "Sem permissão para editar as configurações da IA." };

  const parsed = aiSettingsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const data = parsed.data;

  await db.restaurant.update({
    where: { id: tenant.restaurantId },
    data: {
      aiEnabled: data.aiEnabled,
      faqText: data.faqText?.trim() || null,
      deliveryAreasText: data.deliveryAreasText?.trim() || null,
      defaultDeliveryFee: data.defaultDeliveryFee ?? null,
      acceptedPaymentMethods: data.acceptedPaymentMethods,
    },
  });
  revalidatePath("/atendimento-ia");
}

const MAX_PDF_BASE64_LENGTH = 14_000_000 * 1.4; // ~14MB file, base64-inflated — mirrors the menu-import upload limit

const menuPdfSchema = z.object({
  base64: z.string().min(1).max(MAX_PDF_BASE64_LENGTH, "Arquivo muito grande."),
  fileName: z.string().min(1),
});

/** Stores the restaurant's menu PDF as base64 in Postgres — same pattern already used for WhatsappConnection.qrCode, no new storage infrastructure. */
export async function saveMenuPdf(input: z.infer<typeof menuPdfSchema>) {
  const tenant = await getTenant();
  if (!MANAGER_ROLES.includes(tenant.role)) return { error: "Sem permissão para atualizar o cardápio em PDF." };

  const parsed = menuPdfSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Arquivo inválido." };
  const data = parsed.data;

  await db.restaurant.update({
    where: { id: tenant.restaurantId },
    data: { menuPdfBase64: data.base64, menuPdfFileName: data.fileName, menuPdfUpdatedAt: new Date() },
  });
  revalidatePath("/atendimento-ia");
}

export async function removeMenuPdf() {
  const tenant = await getTenant();
  if (!MANAGER_ROLES.includes(tenant.role)) return { error: "Sem permissão para remover o cardápio em PDF." };

  await db.restaurant.update({
    where: { id: tenant.restaurantId },
    data: { menuPdfBase64: null, menuPdfFileName: null, menuPdfUpdatedAt: null },
  });
  revalidatePath("/atendimento-ia");
}

const createUserSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "A senha precisa ter pelo menos 6 caracteres"),
  role: z.enum(["OWNER", "ADMIN", "ATTENDANT", "KITCHEN"]),
});

export async function createUser(input: z.infer<typeof createUserSchema>) {
  const tenant = await getTenant();
  if (tenant.role !== "OWNER") return { error: "Só o proprietário pode adicionar usuários." };

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const data = parsed.data;

  try {
    const passwordHash = await bcrypt.hash(data.password, 10);
    await db.user.create({
      data: {
        restaurantId: tenant.restaurantId,
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        passwordHash,
        role: data.role,
      },
    });
    revalidatePath("/configuracoes");
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "Já existe um usuário com esse e-mail." };
    }
    throw err;
  }
}

const updateRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["OWNER", "ADMIN", "ATTENDANT", "KITCHEN"]),
});

export async function updateUserRole(input: z.infer<typeof updateRoleSchema>) {
  const tenant = await getTenant();
  if (tenant.role !== "OWNER") return { error: "Só o proprietário pode alterar papéis." };

  const parsed = updateRoleSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };
  const data = parsed.data;

  const user = await db.user.findFirst({ where: { id: data.userId, restaurantId: tenant.restaurantId } });
  if (!user) return { error: "Usuário não encontrado." };

  if (user.role === "OWNER" && data.role !== "OWNER") {
    const ownerCount = await db.user.count({ where: { restaurantId: tenant.restaurantId, role: "OWNER" } });
    if (ownerCount <= 1) return { error: "É preciso ter pelo menos um proprietário." };
  }

  await db.user.update({ where: { id: user.id }, data: { role: data.role } });
  revalidatePath("/configuracoes");
}

export async function deleteUser(userId: string) {
  const tenant = await getTenant();
  if (tenant.role !== "OWNER") return { error: "Só o proprietário pode remover usuários." };
  if (userId === tenant.userId) return { error: "Você não pode remover a si mesmo." };

  const user = await db.user.findFirst({ where: { id: userId, restaurantId: tenant.restaurantId } });
  if (!user) return { error: "Usuário não encontrado." };

  if (user.role === "OWNER") {
    const ownerCount = await db.user.count({ where: { restaurantId: tenant.restaurantId, role: "OWNER" } });
    if (ownerCount <= 1) return { error: "É preciso ter pelo menos um proprietário." };
  }

  await db.user.delete({ where: { id: userId } });
  revalidatePath("/configuracoes");
}
