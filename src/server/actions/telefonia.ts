"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { env, isElevenLabsConfigured } from "@/lib/env";
import { getTenant } from "@/lib/tenant";
import { createOrUpdateAgent, deleteAgent, ElevenLabsNotConfiguredError } from "@/server/integrations/elevenlabs/client";

const MANAGER_ROLES = ["OWNER", "ADMIN"];

/**
 * Creates (first time) or updates (agent already exists) the restaurant's
 * ElevenLabs agent — voice/LLM/tool-webhook shell. The real per-call system
 * prompt (menu, hours, customer recognition) is injected separately by the
 * conversation-initiation webhook every time someone calls
 * (src/server/actions/telefonia-ia-chamada.ts's startPhoneCall) — this
 * generic prompt is only the fallback shown before that override applies.
 */
export async function connectPhoneAgent() {
  const tenant = await getTenant();
  if (!MANAGER_ROLES.includes(tenant.role)) return { error: "Sem permissão para configurar a recepcionista por telefone." };

  if (!isElevenLabsConfigured) return { error: "ElevenLabs não configurada no servidor." };
  if (!env.APP_URL) {
    return { error: "APP_URL não configurada no servidor — necessária para as ferramentas do agente encontrarem esta plataforma." };
  }

  const restaurant = await db.restaurant.findUniqueOrThrow({
    where: { id: tenant.restaurantId },
    select: { name: true, phoneAgentElevenLabsAgentId: true },
  });

  try {
    const result = await createOrUpdateAgent({
      agentId: restaurant.phoneAgentElevenLabsAgentId ?? undefined,
      name: `Recepcionista — ${restaurant.name}`,
      firstMessage: `${restaurant.name}, boa noite! Como posso ajudar?`,
      systemPrompt:
        "Você é a recepcionista virtual deste restaurante. As instruções específicas desta ligação (cardápio, horário, cliente) chegam automaticamente no início de cada chamada — nunca fale sobre cardápio ou preços antes delas.",
      webhookBaseUrl: env.APP_URL,
      webhookSecret: env.ELEVENLABS_WEBHOOK_SECRET!,
    });
    await db.restaurant.update({
      where: { id: tenant.restaurantId },
      data: { phoneAgentEnabled: true, phoneAgentElevenLabsAgentId: result.agent_id },
    });
  } catch (err) {
    if (err instanceof ElevenLabsNotConfiguredError) return { error: err.message };
    console.error("Falha ao criar/atualizar o agente na ElevenLabs:", err);
    return { error: "Não foi possível ativar a recepcionista agora. Tente novamente." };
  }

  revalidatePath("/configuracoes");
  revalidatePath("/atendimento-ia");
}

export async function disconnectPhoneAgent() {
  const tenant = await getTenant();
  if (!MANAGER_ROLES.includes(tenant.role)) return { error: "Sem permissão para configurar a recepcionista por telefone." };

  const restaurant = await db.restaurant.findUniqueOrThrow({
    where: { id: tenant.restaurantId },
    select: { phoneAgentElevenLabsAgentId: true },
  });

  if (restaurant.phoneAgentElevenLabsAgentId) {
    try {
      await deleteAgent(restaurant.phoneAgentElevenLabsAgentId);
    } catch (err) {
      console.error("Falha ao remover o agente na ElevenLabs:", err);
      // Segue desativando localmente mesmo se a remoção remota falhar — o
      // dono não deve ficar travado por causa de um erro na API externa.
    }
  }

  await db.restaurant.update({
    where: { id: tenant.restaurantId },
    data: { phoneAgentEnabled: false, phoneAgentElevenLabsAgentId: null },
  });
  revalidatePath("/configuracoes");
  revalidatePath("/atendimento-ia");
}

/** The Twilio number is purely informational here (linked to the agent manually in the ElevenLabs dashboard — see the plan's limitation note); the human-transfer number is what ElevenLabs' transfer_to_number system tool is configured to call. */
export async function savePhoneAgentNumbers(input: { twilioNumber?: string; humanTransferNumber?: string }) {
  const tenant = await getTenant();
  if (!MANAGER_ROLES.includes(tenant.role)) return { error: "Sem permissão para configurar a recepcionista por telefone." };

  await db.restaurant.update({
    where: { id: tenant.restaurantId },
    data: {
      phoneAgentTwilioNumber: input.twilioNumber?.trim() || null,
      phoneAgentHumanTransferNumber: input.humanTransferNumber?.trim() || null,
    },
  });
  revalidatePath("/configuracoes");
}
