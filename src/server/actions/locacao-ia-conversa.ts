import "server-only";

import { z } from "zod";

import { db } from "@/lib/db";
import { findExistingCustomerByPhone } from "@/lib/customer-lookup";
import { normalizeText } from "@/lib/text-similarity";
import { sendAndRecordOutboundMessage } from "@/server/integrations/evolution/outbound-message";
import { fetchMediaBase64 } from "@/server/integrations/evolution/client";
import { captureReviewApprovalReply } from "@/server/actions/avaliacoes";
import {
  runWhatsappAgent,
  type AgentTool,
  type AgentToolHandler,
  type AgentTurn,
} from "@/server/integrations/anthropic/whatsapp-agent";
import type { Prisma } from "@/generated/prisma";

/**
 * Agente 5's WhatsApp orchestration — the locação-domain counterpart to
 * atendimento-ia-conversa.ts/despacho-ia-conversa.ts/orcamento-ia-conversa.ts,
 * same shape (idempotency → Conversation/Message → tool-calling agent →
 * reply). Fatia 1 only (agendamento de visita + coleta de documentos) —
 * nenhuma lógica de ContratoLocacao/CobrancaRecorrente/aprovação existe
 * ainda, por instrução explícita do próprio documento.
 *
 * No persisted draft here (unlike the other 3 domains) — agendar_visita
 * takes everything it needs (imovelId/dataHora/customerName) directly as
 * tool arguments in one call, instead of being progressively assembled
 * across several "atualizar_X" turns into Conversation.draftCart. The
 * model still tracks what the customer already said via the ordinary
 * conversation history passed to runWhatsappAgent — a persisted draft
 * would just be unused state here, not a genuine need.
 *
 * Reused as-is: findExistingCustomerByPhone, captureReviewApprovalReply
 * (Agente 1 applies to any business type), sendAndRecordOutboundMessage,
 * fetchMediaBase64 (same document-capture pattern as capturePixProofImage
 * in atendimento-ia-conversa.ts), normalizeText (region matching, same as
 * the specialty matching in despacho-dispatch.ts), runWhatsappAgent.
 */

// ---------- tool schema/definitions ----------

const buscarImoveisSchema = z.object({
  regiao: z.string().optional(),
  orcamentoMax: z.number().optional(),
});

const agendarVisitaSchema = z.object({
  imovelId: z.string(),
  dataHora: z.string(), // ISO
  customerName: z.string().optional(),
});

const TOOLS: AgentTool[] = [
  {
    name: "buscar_imoveis_disponiveis",
    description: "Busca imóveis disponíveis para locação, opcionalmente filtrando por região (bairro/endereço mencionado) e orçamento máximo mensal.",
    input_schema: {
      type: "object",
      properties: {
        regiao: { type: "string", description: "Bairro/região mencionada pelo cliente." },
        orcamentoMax: { type: "number", description: "Valor máximo de aluguel mensal que o cliente aceita pagar." },
      },
    },
  },
  {
    name: "agendar_visita",
    description:
      "Agenda uma visita para um imóvel específico, num horário específico. Só chame depois que o cliente escolher um imóvel (use exatamente o imovelId retornado por buscar_imoveis_disponiveis) e confirmar um horário. Se retornar erro de conflito, ofereça outro horário — nunca diga 'agendado' antes da ferramenta confirmar sucesso.",
    input_schema: {
      type: "object",
      properties: {
        imovelId: { type: "string" },
        dataHora: { type: "string", description: "Data e hora da visita em formato ISO 8601." },
        customerName: { type: "string" },
      },
      required: ["imovelId", "dataHora"],
    },
  },
  {
    name: "transferir_para_humano",
    description: "Transfere a conversa para um atendente humano e desativa as respostas automáticas da IA nesta conversa.",
    input_schema: { type: "object", properties: { motivo: { type: "string" } } },
  },
];

// ---------- system prompt ----------

async function buildLocacaoSystemPrompt(restaurantId: string, phoneNumber: string) {
  const restaurant = await db.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { name: true } });
  const existingCustomer = await findExistingCustomerByPhone(restaurantId, phoneNumber);

  const customerSection = existingCustomer
    ? `- Já cadastrado? Sim — nome: ${existingCustomer.name}, telefone: ${existingCustomer.phone}. Não pergunte de novo.`
    : "- Já cadastrado? Não — pergunte o nome no momento natural, antes de agendar a visita.";

  return `Você é o atendente virtual da imobiliária "${restaurant.name}", conversando pelo WhatsApp com um interessado em alugar um imóvel. Fale como uma pessoa real, educada e objetiva.

REGRAS INEGOCIÁVEIS:
- Frases curtas. Uma pergunta por vez.
- Use buscar_imoveis_disponiveis pra saber quais imóveis existem de verdade — nunca invente endereço, valor ou disponibilidade.
- Depois que o cliente escolher um imóvel e um horário, chame agendar_visita — nunca confirme "agendado" antes da ferramenta retornar sucesso. Se der conflito de horário, peça outro horário.
- Depois que a visita for agendada, explique que a equipe vai pedir o documento de identidade e o comprovante de renda pelo próprio WhatsApp — peça o documento de identidade primeiro, e só depois o comprovante de renda (nessa ordem). O recebimento em si é automático (o cliente manda a foto/arquivo e o sistema reconhece sozinho) — você só orienta, nunca processa o arquivo.
- Se o cliente pedir para falar com uma pessoa, chame transferir_para_humano.

CLIENTE:
${customerSection}`;
}

// ---------- shared visit scheduling (reused by the tool handler and, potentially, other callers) ----------

export type AgendarVisitaResult = { error: string } | { ok: true; candidaturaId: string };

/**
 * The only place a Candidatura is ever created — same "confirm tool is the
 * sole writer" shape as confirmChamadoFromDraft/confirmOrderFromDraftCart.
 * Exported (not just an inline tool-handler closure) so it's directly
 * callable for verification (including simulating the exact-instant race
 * against the @@unique constraint) without needing a real LLM turn.
 */
export async function agendarVisita(params: {
  restaurantId: string;
  phoneNumber: string;
  imovelId: string;
  dataHora: Date;
  customerName?: string;
  conversationId?: string;
}): Promise<AgendarVisitaResult> {
  const { restaurantId, phoneNumber, imovelId, dataHora, customerName, conversationId } = params;

  if (Number.isNaN(dataHora.getTime()) || dataHora < new Date()) return { error: "Data/hora inválida ou no passado." };

  const imovel = await db.imovel.findFirst({ where: { id: imovelId, restaurantId, disponivel: true } });
  if (!imovel) return { error: "Imóvel não encontrado ou não está mais disponível." };

  const corretor =
    (imovel.corretorId ? await db.corretor.findFirst({ where: { id: imovel.corretorId, restaurantId, disponivel: true } }) : null) ??
    (await db.corretor.findFirst({ where: { restaurantId, disponivel: true } }));
  if (!corretor) return { error: "Nenhum corretor disponível no momento para agendar visitas." };

  const restaurant = await db.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { locacaoVisitaDuracaoMin: true } });
  const janelaMs = restaurant.locacaoVisitaDuracaoMin * 60 * 1000;
  const conflito = await db.candidatura.findFirst({
    where: {
      corretorId: corretor.id,
      visitaAgendadaPara: { gte: new Date(dataHora.getTime() - janelaMs), lte: new Date(dataHora.getTime() + janelaMs) },
    },
  });
  if (conflito) return { error: "Esse horário está muito próximo de outra visita já agendada para o mesmo corretor — escolha outro horário." };

  const existingCustomer = await db.customer.findFirst({ where: { restaurantId, phone: phoneNumber } });
  const requestedName = customerName?.trim() || existingCustomer?.name;
  const customer = requestedName
    ? (existingCustomer ?? (await db.customer.create({ data: { restaurantId, name: requestedName, phone: phoneNumber } })))
    : existingCustomer;

  try {
    const candidatura = await db.candidatura.create({
      data: {
        restaurantId,
        imovelId,
        customerId: customer?.id,
        corretorId: corretor.id,
        telefone: phoneNumber,
        status: "VISITA_AGENDADA",
        visitaAgendadaPara: dataHora,
      },
    });
    if (customer && conversationId) await db.conversation.update({ where: { id: conversationId }, data: { customerId: customer.id } });
    return { ok: true, candidaturaId: candidatura.id };
  } catch (err) {
    // P2002 = unique constraint violation on [corretorId, visitaAgendadaPara] —
    // the exact-instant race: someone else booked this exact slot first.
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002") {
      return { error: "Esse horário acabou de ser ocupado — escolha outro." };
    }
    console.error("Falha ao criar candidatura:", err);
    return { error: "Não foi possível agendar agora. Tente outro horário." };
  }
}

// ---------- tool handlers ----------

function buildToolHandlers(params: { restaurantId: string; phoneNumber: string; conversationId: string }): Record<string, AgentToolHandler> {
  const { restaurantId, phoneNumber, conversationId } = params;

  return {
    async buscar_imoveis_disponiveis(input) {
      const parsed = buscarImoveisSchema.safeParse(input);
      if (!parsed.success) return { error: "Dados inválidos." };

      const imoveis = await db.imovel.findMany({
        where: {
          restaurantId,
          disponivel: true,
          ...(parsed.data.orcamentoMax != null ? { valorAluguel: { lte: parsed.data.orcamentoMax } } : {}),
        },
        take: 20,
      });

      const regiaoNormalizada = parsed.data.regiao ? normalizeText(parsed.data.regiao) : null;
      const filtrados = regiaoNormalizada
        ? imoveis.filter((i) => normalizeText(i.endereco).includes(regiaoNormalizada))
        : imoveis;

      if (filtrados.length === 0) return { imoveis: [], mensagem: "Nenhum imóvel disponível encontrado com esses critérios no momento." };
      return {
        imoveis: filtrados.slice(0, 5).map((i) => ({
          imovelId: i.id,
          endereco: i.endereco,
          valorAluguel: Number(i.valorAluguel),
          condicoes: i.condicoes,
        })),
      };
    },

    async agendar_visita(input) {
      const parsed = agendarVisitaSchema.safeParse(input);
      if (!parsed.success) return { error: "Dados inválidos para agendar a visita." };

      const result = await agendarVisita({
        restaurantId,
        phoneNumber,
        imovelId: parsed.data.imovelId,
        dataHora: new Date(parsed.data.dataHora),
        customerName: parsed.data.customerName,
        conversationId,
      });
      if ("error" in result) return result;
      return { ok: true, candidaturaId: result.candidaturaId, mensagem: "Visita agendada com sucesso." };
    },

    async transferir_para_humano() {
      await db.conversation.update({ where: { id: conversationId }, data: { aiEnabled: false } });
      return { ok: true };
    },
  };
}

// ---------- document capture (short-circuit, mirrors capturePixProofImage) ----------

type LocacaoMedia = { rawMessage: unknown; mimetype: string | null };
type StoredDocumento = { base64: string; mimetype: string; recebidoEm: string };
type DocumentosCandidato = { identidade?: StoredDocumento; comprovanteRenda?: StoredDocumento };

/**
 * Fixed order: identidade first, then comprovanteRenda — the prompt tells
 * the AI to ask in this order, and this capture logic never needs to be
 * "told" which one is next, it just fills whichever of the two is still
 * missing. Once both are present, status flips to EM_ANALISE automatically
 * (a deterministic presence check, never an AI decision). Returns true
 * whenever a Candidatura was found and handled (matching/mirroring
 * capturePixProofImage's own true-when-handled contract).
 */
async function captureDocumentoCandidato(params: {
  restaurantId: string;
  phoneNumber: string;
  instanceName: string;
  media: LocacaoMedia;
}): Promise<boolean> {
  const { restaurantId, phoneNumber, instanceName, media } = params;

  const candidatura = await db.candidatura.findFirst({
    where: { restaurantId, telefone: phoneNumber, status: { in: ["VISITA_AGENDADA", "DOCUMENTOS_PENDENTES"] } },
    orderBy: { createdAt: "desc" },
  });

  let reply: string;
  if (!candidatura) {
    reply = "Recebi seu arquivo, mas não tenho nenhuma visita agendada aguardando documentos no momento.";
  } else {
    const documentos = (candidatura.documentos as DocumentosCandidato | null) ?? {};
    const proximoCampo: keyof DocumentosCandidato | null = !documentos.identidade ? "identidade" : !documentos.comprovanteRenda ? "comprovanteRenda" : null;

    if (!proximoCampo) {
      reply = "Já recebemos seus documentos — nossa equipe está analisando, obrigado!";
    } else {
      try {
        const baixado = await fetchMediaBase64(instanceName, media.rawMessage);
        if (!baixado.base64) throw new Error("Evolution API não retornou o conteúdo do arquivo.");

        const novosDocumentos: DocumentosCandidato = {
          ...documentos,
          [proximoCampo]: { base64: baixado.base64, mimetype: baixado.mimetype ?? media.mimetype ?? "application/octet-stream", recebidoEm: new Date().toISOString() },
        };
        const completos = !!novosDocumentos.identidade && !!novosDocumentos.comprovanteRenda;

        await db.candidatura.update({
          where: { id: candidatura.id },
          data: {
            documentos: novosDocumentos as unknown as Prisma.InputJsonValue,
            status: completos ? "EM_ANALISE" : "DOCUMENTOS_PENDENTES",
          },
        });

        reply = completos
          ? "Recebemos os dois documentos! ✅ Nossa equipe vai analisar e retornar em breve."
          : proximoCampo === "identidade"
            ? "Recebi seu documento de identidade! 📄 Agora, pode mandar o comprovante de renda?"
            : "Recebi seu comprovante de renda! 📄";
      } catch (err) {
        console.error("Falha ao baixar documento da candidatura via Evolution API:", err);
        reply = "Recebi seu arquivo, mas tive um problema pra processar agora. Pode tentar reenviar?";
      }
    }
  }

  await sendAndRecordOutboundMessage({ restaurantId, phoneNumber, instanceName, text: reply });
  return true;
}

// ---------- entry point ----------

export async function processLocacaoMessage(params: {
  restaurantId: string;
  phoneNumber: string;
  pushName: string | null;
  text: string | null;
  media: LocacaoMedia | null;
  whatsappMessageId: string | null;
  instanceName: string;
}) {
  const { restaurantId, phoneNumber, pushName, text, media, whatsappMessageId, instanceName } = params;

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
    data: { conversationId: conversation.id, direction: "IN", content: text ?? "[arquivo]", whatsappMessageId: whatsappMessageId ?? undefined },
  });

  // An inbound file/photo is always treated as a candidate document (if one
  // is expected) — never as a conversational-agent turn, mirroring
  // capturePixProofImage's role in atendimento-ia-conversa.ts.
  if (media) {
    await captureDocumentoCandidato({ restaurantId, phoneNumber, instanceName, media });
    return;
  }
  if (!text) return;

  const handledAsReviewApproval = await captureReviewApprovalReply({ restaurantId, phoneNumber, instanceName, text });
  if (handledAsReviewApproval) return;

  if (!conversation.aiEnabled) return;

  const recentMessages = await db.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: 21,
  });
  const history: AgentTurn[] = recentMessages
    .slice(1)
    .reverse()
    .map((m) => ({ role: m.direction === "IN" ? "user" : "assistant", content: m.content }));

  const systemPrompt = await buildLocacaoSystemPrompt(restaurantId, phoneNumber);
  const toolHandlers = buildToolHandlers({ restaurantId, phoneNumber, conversationId: conversation.id });

  let reply: string;
  try {
    reply = await runWhatsappAgent({ systemPrompt, history, userMessage: text, tools: TOOLS, toolHandlers });
  } catch (err) {
    console.error("Falha ao processar mensagem do agente de locação:", err);
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
