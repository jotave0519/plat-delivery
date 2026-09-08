import "server-only";

import { z } from "zod";

import { db } from "@/lib/db";
import { findExistingCustomerByPhone } from "@/lib/customer-lookup";
import { sendAndRecordOutboundMessage } from "@/server/integrations/evolution/outbound-message";
import { captureReviewApprovalReply } from "@/server/actions/avaliacoes";
import { oferecerProximoTecnico } from "@/server/actions/despacho-dispatch";
import {
  runWhatsappAgent,
  type AgentTool,
  type AgentToolHandler,
  type AgentTurn,
} from "@/server/integrations/anthropic/whatsapp-agent";
import type { UrgenciaNivel, Prisma } from "@/generated/prisma";

/**
 * Agente 3's WhatsApp orchestration — the despacho-domain counterpart to
 * src/server/actions/atendimento-ia-conversa.ts, following the exact same
 * shape (idempotency → Conversation/Message → draft → tool-calling agent →
 * reply) but for a completely different ICP (a service-dispatch business,
 * never a restaurant). Deliberately a sibling file, never a branch inside
 * the ordering agent's code, per AGENTS.md's "each agent in its own
 * namespace" and to guarantee the food-ordering flow already in production
 * is never touched here. Mutually exclusive with atendimento-ia-conversa.ts
 * per restaurant — the webhook route picks one or the other based on
 * Restaurant.whatsappAgentDomain, never both for the same tenant.
 *
 * Reused as-is, not duplicated: findExistingCustomerByPhone (customer
 * recognition), captureReviewApprovalReply (Agente 1's owner-approval
 * short-circuit — applies to any business type, not just restaurants),
 * sendAndRecordOutboundMessage, runWhatsappAgent (the tool-calling loop
 * itself is already channel/domain-agnostic).
 */

// ---------- draft shape (Conversation.draftCart, reused — see schema note) ----------

export type DraftChamado = {
  problema?: string;
  endereco?: string;
  urgencia?: UrgenciaNivel;
  customerName?: string;
};

export function emptyDraftChamado(): DraftChamado {
  return {};
}

export function readDraftChamado(raw: Prisma.JsonValue | null): DraftChamado {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyDraftChamado();
  const v = raw as Record<string, unknown>;
  const urgencia = v.urgencia === "NORMAL" || v.urgencia === "URGENTE" || v.urgencia === "EMERGENCIA" ? v.urgencia : undefined;
  return {
    problema: typeof v.problema === "string" ? v.problema : undefined,
    endereco: typeof v.endereco === "string" ? v.endereco : undefined,
    urgencia,
    customerName: typeof v.customerName === "string" ? v.customerName : undefined,
  };
}

function formatDraftChamadoForPrompt(draft: DraftChamado): string {
  if (!draft.problema && !draft.endereco && !draft.urgencia && !draft.customerName) return "(nada registrado ainda)";
  const lines: string[] = [];
  if (draft.problema) lines.push(`Problema: ${draft.problema}`);
  if (draft.endereco) lines.push(`Endereço: ${draft.endereco}`);
  if (draft.urgencia) lines.push(`Urgência: ${draft.urgencia}`);
  if (draft.customerName) lines.push(`Nome do cliente: ${draft.customerName}`);
  return lines.join("\n");
}

// ---------- tool schema/definitions ----------

export const atualizarChamadoSchema = z.object({
  problema: z.string().optional(),
  endereco: z.string().optional(),
  urgencia: z.enum(["NORMAL", "URGENTE", "EMERGENCIA"]).optional(),
  customerName: z.string().optional(),
});

const TOOLS: AgentTool[] = [
  {
    name: "atualizar_chamado",
    description:
      "Atualiza o chamado em construção com o que o cliente já informou. Cada campo enviado substitui o valor anterior daquele campo; campos omitidos permanecem como estavam. Chame sempre que o cliente descrever o problema, informar o endereço, ou você conseguir avaliar o nível de urgência pelo que foi dito.",
    input_schema: {
      type: "object",
      properties: {
        problema: { type: "string", description: "Descrição do problema (ex.: vazamento, pane elétrica, chave perdida, entupimento)." },
        endereco: { type: "string", description: "Endereço completo onde o serviço é necessário." },
        urgencia: {
          type: "string",
          enum: ["NORMAL", "URGENTE", "EMERGENCIA"],
          description:
            "EMERGENCIA para sinais reais de risco/dano em andamento (ex.: 'vazando muita água', 'sem energia em casa toda', 'cheiro de gás'); URGENTE para incômodo real mas sem risco imediato; NORMAL para o resto. Nunca pergunte 'qual o nível de urgência' diretamente — avalie pelo que o cliente descreveu.",
        },
        customerName: { type: "string", description: "Nome do cliente." },
      },
    },
  },
  {
    name: "confirmar_chamado",
    description:
      "Cria o chamado de verdade e aciona o despacho automático para um técnico disponível. Só chame depois que o cliente ver o resumo (problema, endereço, urgência) e confirmar explicitamente. Nunca invente confirmação.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "transferir_para_humano",
    description:
      "Transfere a conversa para um atendente humano e desativa as respostas automáticas da IA nesta conversa. Use quando o cliente pedir para falar com uma pessoa, ou a conversa estiver travada/confusa.",
    input_schema: { type: "object", properties: { motivo: { type: "string" } } },
  },
];

// ---------- system prompt ----------

async function buildDespachoSystemPrompt(restaurantId: string, phoneNumber: string, draft: DraftChamado) {
  const restaurant = await db.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { name: true } });
  const existingCustomer = await findExistingCustomerByPhone(restaurantId, phoneNumber);

  const customerSection = existingCustomer
    ? `- Já cadastrado? Sim — nome: ${existingCustomer.name}, telefone: ${existingCustomer.phone}. Já está resolvido, não pergunte de novo — só confirme o nome se fizer sentido na conversa.`
    : "- Já cadastrado? Não — é a primeira vez que esse número entra em contato. Pergunte o nome durante a conversa, no momento natural.";

  return `Você é o atendente virtual da empresa "${restaurant.name}", que presta serviços residenciais emergenciais (elétrica, hidráulica, chaveiro, desentupimento). Fale de forma natural, cordial e objetiva, como uma pessoa de verdade — nunca ofereça um menu numerado.

REGRAS INEGOCIÁVEIS:
- Faça UMA pergunta por mensagem. Nunca junte perguntas de assuntos diferentes (problema, endereço, nome são assuntos diferentes) numa mensagem só.
- Nunca pergunte de novo algo que já esteja em CLIENTE ou em CHAMADO ATUAL abaixo, ou que o cliente já tenha dito nesta conversa.
- Antes de confirmar_chamado você precisa saber: o problema, o endereço, e o nome do cliente (pule se já estiver em CLIENTE). Avalie a urgência você mesmo pelo relato do cliente (nunca pergunte "qual o nível de urgência" diretamente) e chame atualizar_chamado com ela.
- Depois de ter tudo isso, mostre um resumo curto (problema, endereço) e diga que já vai buscar um técnico disponível — espere confirmação explícita antes de chamar confirmar_chamado.
- Nunca prometa um horário exato de chegada do técnico — diga sempre que é uma estimativa e que o técnico confirma diretamente.
- Nunca invente preço, disponibilidade de técnico, ou prazo — isso é decidido pelo sistema, não por você.
- Se o cliente pedir para falar com uma pessoa, ou parecer confuso/insatisfeito, chame transferir_para_humano.

CLIENTE:
${customerSection}

CHAMADO ATUAL:
${formatDraftChamadoForPrompt(draft)}`;
}

// ---------- shared chamado confirmation ----------

export type ConfirmChamadoResult = { error: string } | { ok: true; chamado: Awaited<ReturnType<typeof db.chamado.create>> };

/**
 * The only place this domain's "confirmar_chamado" tool ever writes to
 * Customer/Chamado — creates the call, records the RECEBIDO event, and
 * immediately (synchronously, not waiting for the poller) tries to dispatch
 * to the first available technician, since a real emergency can't wait for
 * a 5-minute poll interval.
 */
export async function confirmChamadoFromDraft(params: {
  restaurantId: string;
  contactPhone: string;
  draft: DraftChamado;
}): Promise<ConfirmChamadoResult> {
  const { restaurantId, contactPhone, draft } = params;

  if (!draft.problema?.trim()) return { error: "Falta descrever o problema." };
  if (!draft.endereco?.trim()) return { error: "Falta o endereço." };

  const existingCustomer = await db.customer.findFirst({ where: { restaurantId, phone: contactPhone } });
  const requestedName = draft.customerName?.trim() || existingCustomer?.name;
  if (!requestedName) return { error: "Falta o nome do cliente." };

  const customer = existingCustomer ?? (await db.customer.create({ data: { restaurantId, name: requestedName, phone: contactPhone } }));

  const chamado = await db.chamado.create({
    data: {
      restaurantId,
      customerId: customer.id,
      problema: draft.problema.trim(),
      endereco: draft.endereco.trim(),
      urgencia: draft.urgencia ?? "NORMAL",
      status: "RECEBIDO",
      eventos: { create: [{ status: "RECEBIDO" }] },
    },
  });

  await oferecerProximoTecnico(chamado.id);

  return { ok: true, chamado };
}

// ---------- tool handlers ----------

function buildToolHandlers(params: {
  restaurantId: string;
  phoneNumber: string;
  conversationId: string;
  getDraft: () => DraftChamado;
  setDraft: (draft: DraftChamado) => Promise<void>;
}): Record<string, AgentToolHandler> {
  const { restaurantId, phoneNumber, conversationId, getDraft, setDraft } = params;

  return {
    async atualizar_chamado(input) {
      const parsed = atualizarChamadoSchema.safeParse(input);
      if (!parsed.success) return { error: "Dados inválidos para atualizar o chamado." };
      const current = getDraft();
      const next: DraftChamado = {
        problema: parsed.data.problema ?? current.problema,
        endereco: parsed.data.endereco ?? current.endereco,
        urgencia: parsed.data.urgencia ?? current.urgencia,
        customerName: parsed.data.customerName ?? current.customerName,
      };
      await setDraft(next);
      return { ok: true, chamado: formatDraftChamadoForPrompt(next) };
    },

    async confirmar_chamado() {
      const draft = getDraft();
      const result = await confirmChamadoFromDraft({ restaurantId, contactPhone: phoneNumber, draft });
      if ("error" in result) return result;

      await setDraft(emptyDraftChamado());
      await db.conversation.update({ where: { id: conversationId }, data: { customerId: result.chamado.customerId ?? undefined } });

      return { ok: true, mensagem: "Chamado registrado! Já estamos buscando um técnico disponível." };
    },

    async transferir_para_humano() {
      await db.conversation.update({ where: { id: conversationId }, data: { aiEnabled: false } });
      return { ok: true };
    },
  };
}

// ---------- entry point ----------

export async function processDespachoMessage(params: {
  restaurantId: string;
  phoneNumber: string;
  pushName: string | null;
  text: string;
  whatsappMessageId: string | null;
  instanceName: string;
}) {
  const { restaurantId, phoneNumber, pushName, text, whatsappMessageId, instanceName } = params;

  if (whatsappMessageId) {
    const existing = await db.message.findUnique({ where: { whatsappMessageId } });
    if (existing) return;
  }

  const conversation = await db.conversation.upsert({
    where: { restaurantId_phoneNumber: { restaurantId, phoneNumber } },
    update: { contactName: pushName ?? undefined, lastMessageAt: new Date() },
    create: { restaurantId, phoneNumber, contactName: pushName, aiEnabled: true },
  });

  await db.message.create({
    data: { conversationId: conversation.id, direction: "IN", content: text, whatsappMessageId: whatsappMessageId ?? undefined },
  });

  // Agente 1 (avaliações no Google) applies to any business type, not just
  // restaurants — the owner approving/editing a negative-review draft must
  // never reach this domain's own conversational agent below.
  const handledAsReviewApproval = await captureReviewApprovalReply({ restaurantId, phoneNumber, instanceName, text });
  if (handledAsReviewApproval) return;

  if (!conversation.aiEnabled) return; // handed off to a human

  let draft = readDraftChamado(conversation.draftCart as Prisma.JsonValue | null);
  const setDraft = async (next: DraftChamado) => {
    draft = next;
    await db.conversation.update({ where: { id: conversation.id }, data: { draftCart: next as unknown as Prisma.InputJsonValue } });
  };

  const recentMessages = await db.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: 21,
  });
  const history: AgentTurn[] = recentMessages
    .slice(1)
    .reverse()
    .map((m) => ({ role: m.direction === "IN" ? "user" : "assistant", content: m.content }));

  const systemPrompt = await buildDespachoSystemPrompt(restaurantId, phoneNumber, draft);
  const toolHandlers = buildToolHandlers({ restaurantId, phoneNumber, conversationId: conversation.id, getDraft: () => draft, setDraft });

  let reply: string;
  try {
    reply = await runWhatsappAgent({ systemPrompt, history, userMessage: text, tools: TOOLS, toolHandlers });
  } catch (err) {
    console.error("Falha ao processar mensagem do agente de despacho:", err);
    reply = "Desculpe, tive um problema para responder agora. Um atendente vai continuar por aqui em breve.";
  }

  await sendAndRecordOutboundMessage({
    restaurantId,
    phoneNumber,
    instanceName,
    text: reply,
    customerId: conversation.customerId ?? undefined,
  });
}
