import "server-only";

import { z } from "zod";

import { db } from "@/lib/db";
import {
  buildAssistantContext,
  confirmOrderFromDraftCart,
  emptyDraftCart,
  readDraftCart,
  formatCatalogForPrompt,
  formatDraftCartForPrompt,
  atualizarPedidoSchema,
  type DraftCart,
} from "@/server/actions/atendimento-ia-conversa";
import { PAYMENT_METHOD_LABELS } from "@/lib/order-flow";
import type { Prisma } from "@/generated/prisma";

/**
 * The phone-receptionist counterpart to
 * src/server/actions/atendimento-ia-conversa.ts's WhatsApp orchestration —
 * same shape (build prompt → run tools → confirm order), reusing every
 * shared business-logic piece from that file (buildAssistantContext,
 * confirmOrderFromDraftCart, the DraftCart type/helpers) instead of
 * duplicating them. The actual conversation/voice loop itself is run by
 * ElevenLabs, not by us — this file only implements what ElevenLabs calls
 * *into*: the conversation-initiation webhook (builds the prompt) and the
 * per-tool webhooks (atualizar_pedido/confirmar_pedido/transferir_para_humano),
 * called from src/app/api/telefonia/elevenlabs/[token]/.
 *
 * State between tool calls in the same live call lives in
 * PhoneCall.draftCart (same shape/logic as Conversation.draftCart), keyed
 * by PhoneCall.id — that id is handed back to ElevenLabs as a dynamic
 * variable at call start and echoed in every subsequent tool-call header,
 * the same role whatsappMessageId/conversationId play for WhatsApp.
 */

// ---------- conversation start ----------

export async function startPhoneCall(params: {
  restaurantId: string;
  callerPhone: string;
  calledNumber: string;
  elevenLabsConversationId: string;
}): Promise<{ callId: string; systemPrompt: string; firstMessage: string }> {
  const { restaurantId, callerPhone, calledNumber, elevenLabsConversationId } = params;

  // Idempotent: ElevenLabs may retry the initiation webhook — reuse the same
  // PhoneCall row instead of creating a duplicate for one physical call.
  const call = await db.phoneCall.upsert({
    where: { elevenLabsConversationId },
    update: {},
    create: { restaurantId, callerPhone, calledNumber, elevenLabsConversationId, draftCart: emptyDraftCart() as unknown as Prisma.InputJsonValue },
  });

  const ctx = await buildAssistantContext(restaurantId, callerPhone);
  const draftCart = readDraftCart(call.draftCart as Prisma.JsonValue | null);
  const systemPrompt = buildCallSystemPrompt(ctx, draftCart);

  const firstMessage = ctx.existingCustomer
    ? `${ctx.restaurant.name}, boa noite! Que bom te ouvir de novo. Em que posso ajudar?`
    : `${ctx.restaurant.name}, boa noite! Como posso ajudar?`;

  return { callId: call.id, systemPrompt, firstMessage };
}

export function buildCallSystemPrompt(ctx: Awaited<ReturnType<typeof buildAssistantContext>>, draftCart: DraftCart): string {
  const paymentMethods = ctx.restaurant.acceptedPaymentMethods.map((m) => PAYMENT_METHOD_LABELS[m] ?? m).join(", ");

  const customerSection = ctx.existingCustomer
    ? `Cliente já conhecido: ${ctx.existingCustomer.name}, telefone ${ctx.existingCustomer.phone}. Já está resolvido, não pergunte de novo — só confirme o nome se fizer sentido na conversa.${
        ctx.lastDeliveryAddress ? ` Último endereço de entrega usado: ${ctx.lastDeliveryAddress} — pergunte se é para entregar no mesmo lugar antes de pedir um endereço novo.` : ""
      }`
    : "Cliente novo — este número nunca ligou antes. Pergunte o nome durante a ligação, no momento natural (não logo de cara).";

  // Phrasing is voice-specific (curto, sem markdown, sem listas longas) —
  // o conteúdo (regras de negócio, cardápio, cliente) vem de buildAssistantContext,
  // a mesma fonte usada pelo WhatsApp, então as duas IAs nunca divergem sobre
  // preço, disponibilidade ou dados do restaurante.
  return `Você é a recepcionista do restaurante "${ctx.restaurant.name}", atendendo uma ligação telefônica. Fale como uma atendente real, brasileira, educada e objetiva — nunca como um robô, nunca leia listas longas em voz alta, nunca repita informação que o cliente já deu.

REGRAS INEGOCIÁVEIS DA LIGAÇÃO:
- Frases curtas. Uma pergunta por vez. Nunca junte perguntas de assuntos diferentes (nome, endereço, pagamento são assuntos diferentes — pergunte um de cada vez).
- Nunca invente produto, preço, disponibilidade ou informação fora do CARDÁPIO ou do que está listado abaixo.
- O cliente pode mudar de ideia a qualquer momento — chame atualizar_pedido de novo com o carrinho já corrigido.
- Antes de confirmar_pedido, você precisa ter: itens do pedido, entrega ou retirada, endereço (se entrega), nome do cliente (pule se já estiver em CLIENTE), forma de pagamento. Só então repita um resumo curto e claro em voz alta e espere o cliente confirmar antes de chamar confirmar_pedido.
- Pagamento por Pix: informe a chave Pix e o valor, e diga que o cliente deve mandar o comprovante pelo WhatsApp do restaurante assim que pagar — nunca trate como pago só porque o cliente disse que já pagou.
- Cartão, dinheiro ou outro método presencial: pagamento na entrega ou na retirada, nunca peça comprovante.
- Se o cliente pedir para falar com uma pessoa, tiver uma reclamação, ou você não conseguir resolver algo, chame transferir_para_humano e informe educadamente que vai passar a ligação.
- Se algo der errado tecnicamente (erro ao consultar o sistema, produto que sumiu), explique com naturalidade ("deixa eu confirmar isso rapidinho") e nunca desligue a ligação sozinha.

CLIENTE:
${customerSection}

RESTAURANTE:
- Endereço: ${ctx.restaurant.address ?? "não informado"}
- Chave Pix: ${ctx.restaurant.pixKey ?? "não configurada — se pedirem Pix, diga que a equipe confirma em seguida"}
- Formas de pagamento aceitas: ${paymentMethods || "não configurado"}
- Taxa de entrega: ${ctx.restaurant.defaultDeliveryFee != null ? `R$ ${ctx.restaurant.defaultDeliveryFee.toFixed(2)}` : "consulte a equipe"}
- Está aberto agora? ${ctx.isOpen ? "Sim" : "Não — informe com educação que está fechado, mas pode anotar o pedido para quando reabrir"}
${ctx.restaurant.faqText ? `\nPERGUNTAS FREQUENTES:\n${ctx.restaurant.faqText}` : ""}

CARDÁPIO (use exatamente os productId/optionItemId ao chamar atualizar_pedido):
${formatCatalogForPrompt(ctx.catalog)}

CARRINHO ATUAL:
${formatDraftCartForPrompt(draftCart)}`;
}

// ---------- tools ----------

async function getCall(callId: string) {
  return db.phoneCall.findUniqueOrThrow({ where: { id: callId } });
}

async function setDraftCart(callId: string, cart: DraftCart) {
  await db.phoneCall.update({ where: { id: callId }, data: { draftCart: cart as unknown as Prisma.InputJsonValue } });
}

export async function handleAtualizarPedido(callId: string, input: unknown) {
  const parsed = atualizarPedidoSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos para atualizar o pedido." };
  const data = parsed.data;

  const call = await getCall(callId);
  const current = readDraftCart(call.draftCart as Prisma.JsonValue | null);

  let items = current.items;
  if (data.items) {
    const ctx = await buildAssistantContext(call.restaurantId, call.callerPhone);
    const productMap = new Map(ctx.catalog.flatMap((c) => c.products).map((p) => [p.id, p]));
    const resolved = [];
    for (const item of data.items) {
      const product = productMap.get(item.productId);
      if (!product) return { error: `Produto ${item.productId} não encontrado ou indisponível.` };
      resolved.push({
        productId: item.productId,
        productName: product.name,
        quantity: item.quantity,
        notes: item.notes,
        optionItemIds: item.optionItemIds,
      });
    }
    items = resolved;
  }

  const next: DraftCart = {
    items,
    fulfillment: data.fulfillment ?? current.fulfillment,
    address: data.address ?? current.address,
    paymentMethod: data.paymentMethod ?? current.paymentMethod,
    phoneToUse: data.phoneToUse ?? current.phoneToUse,
    customerName: data.customerName ?? current.customerName,
  };
  await setDraftCart(callId, next);
  return { ok: true, carrinho: formatDraftCartForPrompt(next) };
}

export async function handleConfirmarPedido(callId: string) {
  const call = await getCall(callId);
  const cart = readDraftCart(call.draftCart as Prisma.JsonValue | null);

  const result = await confirmOrderFromDraftCart({
    restaurantId: call.restaurantId,
    channel: "TELEFONE_IA",
    contactPhone: call.callerPhone,
    cart,
  });
  if ("error" in result) return result;

  await db.phoneCall.update({
    where: { id: callId },
    data: { draftCart: emptyDraftCart() as unknown as Prisma.InputJsonValue, customerId: result.order.customerId, orderId: result.order.id },
  });

  return {
    ok: true,
    numeroPedido: result.order.number,
    total: result.total.toFixed(2),
    mensagem: `Pedido número ${result.order.number} criado com sucesso.`,
  };
}

/**
 * Only records the handoff for our own history/monitoring — the actual call
 * transfer is ElevenLabs' built-in transfer_to_number system tool (configured
 * on the agent, pointed at Restaurant.phoneAgentHumanTransferNumber), not
 * something this webhook performs itself.
 */
export async function handleTransferirParaHumano(callId: string) {
  await db.phoneCall.update({ where: { id: callId }, data: { status: "TRANSFERIDA", transferredToHuman: true } });
  return { ok: true };
}

// ---------- call end (post-call webhook) ----------

const finishCallSchema = z.object({
  status: z.enum(["CONCLUIDA", "TRANSFERIDA", "FALHA"]).optional(),
  durationSeconds: z.number().int().min(0).optional(),
  errorNote: z.string().optional(),
});

export async function finishPhoneCall(callId: string, input: unknown) {
  const parsed = finishCallSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos para encerrar a ligação." };

  const call = await getCall(callId);
  await db.phoneCall.update({
    where: { id: callId },
    data: {
      status: parsed.data.status ?? (call.transferredToHuman ? "TRANSFERIDA" : "CONCLUIDA"),
      durationSeconds: parsed.data.durationSeconds,
      errorNote: parsed.data.errorNote,
      endedAt: new Date(),
    },
  });
  return { ok: true };
}
