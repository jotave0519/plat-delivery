"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { env, isEvolutionApiConfigured } from "@/lib/env";
import { getTenant } from "@/lib/tenant";
import {
  createInstance,
  deleteInstance,
  EvolutionApiNotConfiguredError,
} from "@/server/integrations/evolution/client";

const MANAGER_ROLES = ["OWNER", "ADMIN"];

/** Deterministic per-restaurant instance name — one Evolution API instance per tenant. */
function instanceNameFor(restaurantId: string) {
  return `restaurant-${restaurantId}`;
}

export async function connectWhatsapp() {
  const tenant = await getTenant();
  if (!MANAGER_ROLES.includes(tenant.role)) return { error: "Sem permissão para conectar o WhatsApp." };

  if (!isEvolutionApiConfigured) return { error: "Evolution API não configurada no servidor." };
  if (!env.APP_URL) {
    return { error: "APP_URL não configurada no servidor — necessária para receber o webhook da Evolution API." };
  }

  const existing = await db.whatsappConnection.findUnique({ where: { restaurantId: tenant.restaurantId } });
  if (existing?.status === "CONNECTED") return { error: "O WhatsApp já está conectado." };

  const instanceName = existing?.instanceName ?? instanceNameFor(tenant.restaurantId);
  const webhookUrl = `${env.APP_URL}/api/webhooks/evolution/${env.EVOLUTION_WEBHOOK_SECRET}`;

  try {
    const result = await createInstance(instanceName, webhookUrl);
    await db.whatsappConnection.upsert({
      where: { restaurantId: tenant.restaurantId },
      create: {
        restaurantId: tenant.restaurantId,
        instanceName,
        status: "CONNECTING",
        qrCode: result.qrcode?.base64 ?? null,
      },
      update: {
        instanceName,
        status: "CONNECTING",
        qrCode: result.qrcode?.base64 ?? null,
        phoneNumber: null,
      },
    });
  } catch (err) {
    if (err instanceof EvolutionApiNotConfiguredError) return { error: err.message };
    await db.whatsappConnection.upsert({
      where: { restaurantId: tenant.restaurantId },
      create: { restaurantId: tenant.restaurantId, instanceName, status: "ERROR" },
      update: { status: "ERROR" },
    });
    return { error: "Não foi possível criar a instância na Evolution API. Tente novamente." };
  }

  revalidatePath("/atendimento-ia");
}

export async function disconnectWhatsapp() {
  const tenant = await getTenant();
  if (!MANAGER_ROLES.includes(tenant.role)) return { error: "Sem permissão para desconectar o WhatsApp." };

  const connection = await db.whatsappConnection.findUnique({ where: { restaurantId: tenant.restaurantId } });
  if (!connection) return { error: "Nenhuma conexão encontrada." };

  try {
    await deleteInstance(connection.instanceName);
  } catch {
    return { error: "Não foi possível remover a instância na Evolution API. Tente novamente." };
  }

  await db.whatsappConnection.update({
    where: { restaurantId: tenant.restaurantId },
    data: { status: "DISCONNECTED", qrCode: null, phoneNumber: null },
  });
  revalidatePath("/atendimento-ia");
}

/** Polled by the client component while status = CONNECTING, to reflect webhook updates without a full reload. */
export async function refreshConnectionStatus() {
  const tenant = await getTenant();
  const connection = await db.whatsappConnection.findUnique({ where: { restaurantId: tenant.restaurantId } });
  if (!connection) return null;
  return {
    status: connection.status,
    qrCode: connection.qrCode,
    phoneNumber: connection.phoneNumber,
    lastEventAt: connection.lastEventAt,
  };
}
