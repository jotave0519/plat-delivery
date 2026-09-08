import "server-only";

import { z } from "zod";

import { db } from "@/lib/db";
import { findExistingCustomerByPhone } from "@/lib/customer-lookup";
import { sendAndRecordOutboundMessage } from "@/server/integrations/evolution/outbound-message";
import { captureReviewApprovalReply } from "@/server/actions/avaliacoes";
import { calcularPreco } from "@/server/orcamento/pricing";
import { enviarOrcamentoWhatsapp, formatOrcamentoMessage } from "@/server/actions/orcamento-dispatch";
import {
  runWhatsappAgent,
  type AgentTool,
  type AgentToolHandler,
  type AgentTurn,
} from "@/server/integrations/anthropic/whatsapp-agent";
import type { Prisma } from "@/generated/prisma";

/**
 * Agente 4's WhatsApp orchestration — the orçamento-domain counterpart to
 * atendimento-ia-conversa.ts/despacho-ia-conversa.ts, same shape
 * (idempotency → Conversation/Message → draft → tool-calling agent →
 * reply). Own file, own domain (per the confirmed decision: independent
 * from Agente 3, not an extension of its conversation) — mutually
 * exclusive with PEDIDO/DESPACHO via Restaurant.whatsappAgentDomain.
 *
 * Reused as-is: findExistingCustomerByPhone, captureReviewApprovalReply
 * (Agente 1 applies to any business type), sendAndRecordOutboundMessage,
 * runWhatsappAgent (the tool-calling loop is already domain-agnostic).
 */

// ---------- draft shape (Conversation.draftCart, reused — see schema note) ----------

export type DraftQuote = {
  customerName?: string;
  dados: Record<string, number>;
};

export function emptyDraftQuote(): DraftQuote {
  return { dados: {} };
}

export function readDraftQuote(raw: Prisma.JsonValue | null): DraftQuote {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyDraftQuote();
  const v = raw as Record<string, unknown>;
  const dados: Record<string, number> = {};
  if (v.dados && typeof v.dados === "object" && !Array.isArray(v.dados)) {
    for (const [key, val] of Object.entries(v.dados as Record<string, unknown>)) {
      if (typeof val === "number") dados[key] = val;
    }
  }
  return { customerName: typeof v.customerName === "string" ? v.customerName : undefined, dados };
}

function formatDraftQuoteForPrompt(draft: DraftQuote): string {
  const entries = Object.entries(draft.dados);
  if (entries.length === 0 && !draft.customerName) return "(nada coletado ainda)";
  const lines = entries.map(([k, v]) => `  - ${k}: ${v}`);
  if (draft.customerName) lines.unshift(`Nome do cliente: ${draft.customerName}`);
  return lines.join("\n");
}

// ---------- tool schema/definitions ----------

export const atualizarOrcamentoSchema = z.object({
  customerName: z.string().optional(),
  dados: z.record(z.string(), z.number()).optional(),
});

export const responderOrcamentoSchema = z.object({
  resposta: z.enum(["ACEITO", "RECUSADO"]),
});

const TOOLS: AgentTool[] = [
  {
    name: "atualizar_orcamento",
    description:
      "Atualiza os dados coletados para o orçamento. Envie só os campos novos ou corrigidos — os já enviados antes permanecem, a menos que sejam sobrescritos aqui. Use exatamente as chaves ('variavel') listadas em DADOS A COLETAR.",
    input_schema: {
      type: "object",
      properties: {
        customerName: { type: "string", description: "Nome do cliente." },
        dados: {
          type: "object",
          description: "Mapa de variável → valor numérico coletado (ex.: {\"m2\": 80, \"km\": 12}). Use exatamente as chaves listadas em DADOS A COLETAR.",
          additionalProperties: { type: "number" },
        },
      },
    },
  },
  {
    name: "calcular_orcamento",
    description:
      "Calcula o preço no servidor a partir dos dados já coletados e, se suficiente, já envia o orçamento formatado pro cliente. Só chame depois de ter coletado o que for necessário. Se retornar erro pedindo mais dados, NUNCA invente um valor — explique que uma visita técnica será necessária.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "responder_orcamento",
    description:
      "Registra a resposta do cliente a um orçamento já enviado (aceitou ou recusou), com base no que ele disse em linguagem natural. Só chame quando a resposta for razoavelmente clara.",
    input_schema: {
      type: "object",
      properties: { resposta: { type: "string", enum: ["ACEITO", "RECUSADO"] } },
      required: ["resposta"],
    },
  },
  {
    name: "transferir_para_humano",
    description: "Transfere a conversa para um atendente humano e desativa as respostas automáticas da IA nesta conversa.",
    input_schema: { type: "object", properties: { motivo: { type: "string" } } },
  },
];

// ---------- system prompt ----------

async function buildOrcamentoSystemPrompt(restaurantId: string, phoneNumber: string, draft: DraftQuote) {
  const restaurant = await db.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    select: { name: true, quoteAgentNicho: true },
  });
  const rules = await db.pricingRule.findMany({ where: { restaurantId, ativo: true } });
  const existingCustomer = await findExistingCustomerByPhone(restaurantId, phoneNumber);

  // The questions come from whatever PricingRule rows this tenant configured
  // — never a hardcoded per-nicho question flow (see the plan's correction
  // #2: hardcoding jardinagem/limpeza/mudança/reforma branches would
  // contradict the single-configurable-engine differentiation this agent
  // exists for). "taxa_base" is never asked about — it's always applied.
  const perguntas = rules
    .filter((r) => r.variavel !== "taxa_base")
    .map((r) => `  - ${r.nome} [variavel: ${r.variavel}]${r.obrigatoria ? " (obrigatório)" : " (opcional)"}`)
    .join("\n");

  const customerSection = existingCustomer
    ? `- Já cadastrado? Sim — nome: ${existingCustomer.name}, telefone: ${existingCustomer.phone}. Não pergunte de novo, só confirme o nome se fizer sentido.`
    : "- Já cadastrado? Não — pergunte o nome durante a conversa, no momento natural.";

  return `Você é o atendente virtual da empresa "${restaurant.name}"${restaurant.quoteAgentNicho ? ` (${restaurant.quoteAgentNicho})` : ""}, conversando pelo WhatsApp para dar um orçamento. Fale como uma pessoa real, educada e objetiva.

REGRAS INEGOCIÁVEIS:
- Frases curtas. Uma pergunta por vez. Nunca junte perguntas de assuntos diferentes.
- Nunca invente ou estime um preço você mesmo — o preço só existe depois de calcular_orcamento confirmar. Se a ferramenta disser que faltam dados, explique que uma visita técnica será necessária para fechar o valor com segurança — nunca chute um número.
- Nunca prometa um preço fechado antes de calcular_orcamento ter sucesso.
- Colete os dados abaixo, um de cada vez, chamando atualizar_orcamento a cada resposta nova do cliente. Pule o que já estiver em DADOS JÁ COLETADOS.
- Depois de coletar o que for necessário, chame calcular_orcamento — ele já envia o orçamento formatado pro cliente se dados forem suficientes.
- Se o cliente responder a um orçamento já enviado (aceitando ou recusando), chame responder_orcamento com a interpretação da resposta.
- Se o cliente pedir para falar com uma pessoa, chame transferir_para_humano.

CLIENTE:
${customerSection}

DADOS A COLETAR:
${perguntas || "(nenhuma regra de preço configurada — avise que a equipe vai entrar em contato)"}

DADOS JÁ COLETADOS:
${formatDraftQuoteForPrompt(draft)}`;
}

// ---------- tool handlers ----------

function buildToolHandlers(params: {
  restaurantId: string;
  phoneNumber: string;
  instanceName: string;
  conversationId: string;
  getDraft: () => DraftQuote;
  setDraft: (draft: DraftQuote) => Promise<void>;
}): Record<string, AgentToolHandler> {
  const { restaurantId, phoneNumber, instanceName, conversationId, getDraft, setDraft } = params;

  return {
    async atualizar_orcamento(input) {
      const parsed = atualizarOrcamentoSchema.safeParse(input);
      if (!parsed.success) return { error: "Dados inválidos." };
      const current = getDraft();
      const next: DraftQuote = {
        customerName: parsed.data.customerName ?? current.customerName,
        dados: { ...current.dados, ...(parsed.data.dados ?? {}) },
      };
      await setDraft(next);
      return { ok: true, coletado: formatDraftQuoteForPrompt(next) };
    },

    async calcular_orcamento() {
      const draft = getDraft();
      const priced = await calcularPreco(restaurantId, draft.dados);
      if ("error" in priced) return priced;

      const restaurant = await db.restaurant.findUniqueOrThrow({
        where: { id: restaurantId },
        select: { name: true, quoteFollowUpDias: true, quoteValidadeDias: true },
      });

      const existingCustomer = await db.customer.findFirst({ where: { restaurantId, phone: phoneNumber } });
      const requestedName = draft.customerName?.trim() || existingCustomer?.name;
      const customer = requestedName
        ? (existingCustomer ?? (await db.customer.create({ data: { restaurantId, name: requestedName, phone: phoneNumber } })))
        : existingCustomer;

      const now = Date.now();
      const validoAte = new Date(now + restaurant.quoteValidadeDias * 24 * 60 * 60 * 1000);
      const quote = await db.quote.create({
        data: {
          restaurantId,
          customerId: customer?.id,
          dadosColetados: draft.dados as unknown as Prisma.InputJsonValue,
          precoCalculado: priced.total,
          status: "ENVIADO",
          validoAte,
        },
      });
      await db.quoteFollowUp.create({
        data: { quoteId: quote.id, enviarEm: new Date(now + restaurant.quoteFollowUpDias * 24 * 60 * 60 * 1000) },
      });
      if (customer) await db.conversation.update({ where: { id: conversationId }, data: { customerId: customer.id } });

      // Sent directly by the tool (deterministic template, guaranteed
      // correct numbers), same precedent as enviar_cardapio_pdf sending its
      // own artifact — the agent's own turn-ending reply is just a short
      // conversational line, never re-stating the numbers itself.
      const text = formatOrcamentoMessage({ restaurantName: restaurant.name, detalhamento: priced.detalhamento, total: priced.total, validoAte });
      await enviarOrcamentoWhatsapp({ restaurantId, phoneNumber, instanceName, text, customerId: customer?.id });

      await setDraft(emptyDraftQuote());
      return { ok: true, mensagem: "Orçamento enviado ao cliente." };
    },

    async responder_orcamento(input) {
      const parsed = responderOrcamentoSchema.safeParse(input);
      if (!parsed.success) return { error: "Resposta inválida." };

      const pending = await db.quote.findFirst({
        where: { restaurantId, status: "ENVIADO", customer: { phone: phoneNumber } },
        orderBy: { createdAt: "desc" },
      });
      if (!pending) return { error: "Não há orçamento aguardando resposta para este cliente." };

      const claim = await db.quote.updateMany({
        where: { id: pending.id, status: "ENVIADO" },
        data: { status: parsed.data.resposta },
      });
      if (claim.count === 0) return { error: "Este orçamento já foi respondido." };

      return { ok: true };
    },

    async transferir_para_humano() {
      await db.conversation.update({ where: { id: conversationId }, data: { aiEnabled: false } });
      return { ok: true };
    },
  };
}

// ---------- entry point ----------

export async function processOrcamentoMessage(params: {
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

  const handledAsReviewApproval = await captureReviewApprovalReply({ restaurantId, phoneNumber, instanceName, text });
  if (handledAsReviewApproval) return;

  if (!conversation.aiEnabled) return;

  let draft = readDraftQuote(conversation.draftCart as Prisma.JsonValue | null);
  const setDraft = async (next: DraftQuote) => {
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

  const systemPrompt = await buildOrcamentoSystemPrompt(restaurantId, phoneNumber, draft);
  const toolHandlers = buildToolHandlers({ restaurantId, phoneNumber, instanceName, conversationId: conversation.id, getDraft: () => draft, setDraft });

  let reply: string;
  try {
    reply = await runWhatsappAgent({ systemPrompt, history, userMessage: text, tools: TOOLS, toolHandlers });
  } catch (err) {
    console.error("Falha ao processar mensagem do agente de orçamento:", err);
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
