"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { env, isElevenLabsConfigured } from "@/lib/env";
import { getTenant } from "@/lib/tenant";
import { createOrUpdateAgent, deleteAgent, ElevenLabsNotConfiguredError } from "@/server/integrations/elevenlabs/client";

const MANAGER_ROLES = ["OWNER", "ADMIN"];

const GENERIC_TOOLS = [
  { name: "buscar_horarios_disponiveis", description: "Busca horários de agenda disponíveis, opcionalmente a partir de uma data pedida pelo cliente." },
  { name: "agendar_horario", description: "Confirma o agendamento de um horário específico já retornado por buscar_horarios_disponiveis. Nunca diga 'agendado' antes desta ferramenta confirmar sucesso." },
  { name: "qualificar_lead", description: "Registra o que já se sabe sobre o serviço pedido, urgência e região do cliente — pode ser chamada mais de uma vez, conforme for descobrindo mais informação." },
  { name: "transferir_para_humano", description: "Encaminha a ligação para um atendente humano." },
];

/**
 * Same create/update pattern as src/server/actions/telefonia.ts's
 * connectPhoneAgent — the only difference is which tool set and domain
 * this agent gets (ATENDIMENTO_GENERICO instead of the default PEDIDO).
 * Deliberately a separate action, not a parameter on connectPhoneAgent,
 * so the two domains' settings screens/flows stay independently readable.
 */
export async function connectGenericAttendanceAgent() {
  const tenant = await getTenant();
  if (!MANAGER_ROLES.includes(tenant.role)) return { error: "Sem permissão para configurar a recepcionista por telefone." };

  if (!isElevenLabsConfigured) return { error: "ElevenLabs não configurada no servidor." };
  if (!env.APP_URL) {
    return { error: "APP_URL não configurada no servidor — necessária para as ferramentas do agente encontrarem esta plataforma." };
  }

  const restaurant = await db.restaurant.findUniqueOrThrow({
    where: { id: tenant.restaurantId },
    select: { name: true, phoneAgentElevenLabsAgentId: true, phoneAgentHumanTransferNumber: true },
  });

  try {
    const result = await createOrUpdateAgent({
      agentId: restaurant.phoneAgentElevenLabsAgentId ?? undefined,
      name: `Recepcionista — ${restaurant.name}`,
      firstMessage: `${restaurant.name}, boa tarde! Como posso ajudar?`,
      systemPrompt:
        "Você é a recepcionista virtual deste negócio. As instruções específicas desta ligação (serviços, FAQ, cliente) chegam automaticamente no início de cada chamada — nunca fale sobre serviços ou preços antes delas.",
      webhookBaseUrl: env.APP_URL,
      webhookSecret: env.ELEVENLABS_WEBHOOK_SECRET!,
      tools: GENERIC_TOOLS,
      humanTransferNumber: restaurant.phoneAgentHumanTransferNumber ?? undefined,
    });
    await db.restaurant.update({
      where: { id: tenant.restaurantId },
      data: { phoneAgentEnabled: true, phoneAgentDomain: "ATENDIMENTO_GENERICO", phoneAgentElevenLabsAgentId: result.agent_id },
    });
  } catch (err) {
    if (err instanceof ElevenLabsNotConfiguredError) return { error: err.message };
    console.error("Falha ao criar/atualizar o agente de atendimento genérico na ElevenLabs:", err);
    return { error: "Não foi possível ativar a recepcionista agora. Tente novamente." };
  }

  revalidatePath("/configuracoes");
}

export async function disconnectGenericAttendanceAgent() {
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
    }
  }

  await db.restaurant.update({
    where: { id: tenant.restaurantId },
    data: { phoneAgentEnabled: false, phoneAgentElevenLabsAgentId: null },
  });
  revalidatePath("/configuracoes");
}

export async function saveFaqEServicos(input: { faqGenericoText?: string; servicos?: { nome: string; precoBase?: number }[] }) {
  const tenant = await getTenant();
  if (!MANAGER_ROLES.includes(tenant.role)) return { error: "Sem permissão para configurar a recepcionista por telefone." };

  await db.restaurant.update({
    where: { id: tenant.restaurantId },
    data: {
      faqGenericoText: input.faqGenericoText?.trim() || null,
      servicosGenericosJson: input.servicos && input.servicos.length > 0 ? input.servicos : undefined,
    },
  });
  revalidatePath("/configuracoes");
}
