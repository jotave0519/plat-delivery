import "server-only";

import { z } from "zod";

import { db } from "@/lib/db";
import { normalizeOpeningHours, isOpenNow, formatOpeningHoursSummary } from "@/lib/opening-hours";
import { getCatalogForOrderForm, type CatalogCategory } from "@/server/queries/orders";
import { priceOrderItems, nextOrderNumber } from "@/server/orders/pricing";
import { sendTextMessage, sendDocument } from "@/server/integrations/evolution/client";
import { PAYMENT_METHOD_LABELS } from "@/lib/order-flow";
import {
  runWhatsappAgent,
  type AgentTool,
  type AgentToolHandler,
  type AgentTurn,
} from "@/server/integrations/anthropic/whatsapp-agent";
import type { PaymentMethod, Prisma } from "@/generated/prisma";

/**
 * The core inbound-message orchestration for the WhatsApp ordering agent.
 * Called from the Evolution API webhook route (MESSAGES_UPSERT) — no
 * session exists here, so the restaurant is always resolved by
 * instanceName/restaurantId passed in, never via getTenant().
 *
 * Pipeline: resolve/create Conversation → idempotency check → build system
 * prompt (restaurant info, menu, hours, FAQ, payment methods, draft cart) →
 * run the tool-calling agent → send the reply → persist both messages.
 *
 * The AI never writes to Customer/Order directly — only the
 * "confirmar_pedido" tool does, and even then prices are always re-derived
 * from the database via priceOrderItems, exactly like the manual order form.
 */

// ---------- draft cart shape (Conversation.draftCart) ----------

type DraftCartItem = { productId: string; productName: string; quantity: number; notes?: string; optionItemIds?: string[] };
type DraftCart = {
  items: DraftCartItem[];
  fulfillment?: "DELIVERY" | "RETIRADA";
  address?: string;
  paymentMethod?: PaymentMethod;
  phoneToUse?: string;
  customerName?: string;
};

function emptyDraftCart(): DraftCart {
  return { items: [] };
}

function readDraftCart(raw: Prisma.JsonValue | null): DraftCart {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyDraftCart();
  const v = raw as Record<string, unknown>;
  return {
    items: Array.isArray(v.items) ? (v.items as DraftCartItem[]) : [],
    fulfillment: v.fulfillment === "DELIVERY" || v.fulfillment === "RETIRADA" ? v.fulfillment : undefined,
    address: typeof v.address === "string" ? v.address : undefined,
    paymentMethod: typeof v.paymentMethod === "string" ? (v.paymentMethod as PaymentMethod) : undefined,
    phoneToUse: typeof v.phoneToUse === "string" ? v.phoneToUse : undefined,
    customerName: typeof v.customerName === "string" ? v.customerName : undefined,
  };
}

function formatCatalogForPrompt(catalog: CatalogCategory[]): string {
  if (catalog.length === 0) return "(nenhum produto disponível no momento)";
  return catalog
    .map((cat) => {
      const products = cat.products
        .map((p) => {
          const opts = p.optionGroups
            .map(
              (g) =>
                `    - ${g.name}${g.required ? " (obrigatório)" : ""}: ${g.items
                  .map((i) => `${i.name} [optionItemId: ${i.id}] (+R$ ${i.price.toFixed(2)})`)
                  .join(", ")}`,
            )
            .join("\n");
          return `  • [productId: ${p.id}] ${p.name} — R$ ${p.price.toFixed(2)}${p.description ? ` — ${p.description}` : ""}${opts ? `\n${opts}` : ""}`;
        })
        .join("\n");
      return `${cat.name}:\n${products}`;
    })
    .join("\n\n");
}

function formatDraftCartForPrompt(cart: DraftCart): string {
  if (cart.items.length === 0 && !cart.address && !cart.paymentMethod) return "(carrinho vazio ainda)";
  const lines: string[] = [];
  if (cart.items.length > 0) {
    lines.push(
      "Itens:",
      ...cart.items.map((i) => `  - ${i.quantity}x ${i.productName}${i.notes ? ` (${i.notes})` : ""}`),
    );
  }
  if (cart.fulfillment) lines.push(`Entrega/retirada: ${cart.fulfillment === "DELIVERY" ? "Entrega" : "Retirada"}`);
  if (cart.address) lines.push(`Endereço: ${cart.address}`);
  if (cart.paymentMethod) lines.push(`Pagamento: ${PAYMENT_METHOD_LABELS[cart.paymentMethod] ?? cart.paymentMethod}`);
  if (cart.phoneToUse) lines.push(`Telefone para o pedido: ${cart.phoneToUse}`);
  if (cart.customerName) lines.push(`Nome do cliente: ${cart.customerName}`);
  return lines.join("\n");
}

// ---------- tool schemas ----------

const cartItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().min(1).max(50),
  notes: z.string().optional(),
  optionItemIds: z.array(z.string()).optional(),
});

const atualizarPedidoSchema = z.object({
  items: z.array(cartItemSchema).optional(),
  fulfillment: z.enum(["DELIVERY", "RETIRADA"]).optional(),
  address: z.string().optional(),
  paymentMethod: z.enum(["PIX", "CARTAO", "DINHEIRO", "VALE_REFEICAO"]).optional(),
  phoneToUse: z.string().optional(),
  customerName: z.string().optional(),
});

const TOOLS: AgentTool[] = [
  {
    name: "atualizar_pedido",
    description:
      "Atualiza o carrinho em construção do cliente. Envie sempre o estado completo do que deve ficar salvo em cada campo informado (ex.: a lista de itens inteira, não só o item novo) — cada campo enviado substitui o valor anterior daquele campo; campos omitidos permanecem como estavam. Use productId exatamente como aparece no cardápio fornecido. Chame isso sempre que o cliente adicionar, remover ou alterar itens, informar endereço, forma de pagamento, ou dizer qual telefone usar no pedido.",
    input_schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          description: "Lista completa de itens do carrinho (substitui a lista anterior inteira, se enviada).",
          items: {
            type: "object",
            properties: {
              productId: { type: "string", description: "Copie exatamente o valor entre colchetes [productId: ...] do cardápio." },
              quantity: { type: "integer", minimum: 1, maximum: 50 },
              notes: { type: "string" },
              optionItemIds: {
                type: "array",
                items: { type: "string" },
                description: "Copie exatamente os valores entre colchetes [optionItemId: ...] do cardápio.",
              },
            },
            required: ["productId", "quantity"],
          },
        },
        fulfillment: { type: "string", enum: ["DELIVERY", "RETIRADA"] },
        address: { type: "string", description: "Endereço completo de entrega." },
        paymentMethod: { type: "string", enum: ["PIX", "CARTAO", "DINHEIRO", "VALE_REFEICAO"] },
        phoneToUse: { type: "string", description: "Telefone a usar no cadastro do pedido, se diferente do número do WhatsApp." },
        customerName: { type: "string", description: "Nome do cliente para o cadastro." },
      },
    },
  },
  {
    name: "confirmar_pedido",
    description:
      "Confirma e cria o pedido de verdade a partir do carrinho já montado. Só chame depois de o cliente ver o resumo completo (itens, total, entrega/retirada, endereço se aplicável, forma de pagamento) e confirmar explicitamente. Nunca invente confirmação — espere uma resposta afirmativa clara.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "transferir_para_humano",
    description:
      "Transfere a conversa para um atendente humano e desativa as respostas automáticas da IA nesta conversa. Use quando o cliente pedir explicitamente para falar com uma pessoa, ou quando a conversa estiver claramente travada, confusa, ou o cliente demonstrar insatisfação que a IA não consegue resolver.",
    input_schema: {
      type: "object",
      properties: { motivo: { type: "string" } },
    },
  },
  {
    name: "enviar_cardapio_pdf",
    description:
      "Envia o cardápio em PDF para o cliente, se o restaurante tiver um cadastrado. Use quando o cliente pedir o cardápio em PDF/arquivo/foto do cardápio completo.",
    input_schema: { type: "object", properties: {} },
  },
];

// ---------- system prompt ----------

async function buildSystemPrompt(restaurantId: string, draftCart: DraftCart) {
  const restaurant = await db.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    select: {
      name: true,
      phone: true,
      address: true,
      timezone: true,
      pixKey: true,
      openingHours: true,
      faqText: true,
      deliveryAreasText: true,
      defaultDeliveryFee: true,
      acceptedPaymentMethods: true,
      menuPdfFileName: true,
    },
  });

  const catalog = await getCatalogForOrderForm(restaurantId);
  const hours = normalizeOpeningHours(restaurant.openingHours);
  const open = isOpenNow(hours, restaurant.timezone);
  const paymentMethods = restaurant.acceptedPaymentMethods.map((m) => PAYMENT_METHOD_LABELS[m] ?? m).join(", ");

  return `Você é o atendente virtual do restaurante "${restaurant.name}", conversando pelo WhatsApp. Fale de forma natural, cordial e objetiva, como uma pessoa de verdade — nunca ofereça um menu numerado tipo "digite 1 para...".

REGRAS INEGOCIÁVEIS:
- Nunca invente produto, preço, disponibilidade, promoção ou informação que não esteja explicitamente no CARDÁPIO ou nas informações abaixo. Se não souber algo, diga que vai verificar com a equipe, e chame a ferramenta transferir_para_humano se o cliente insistir.
- Preços e disponibilidade vêm sempre do CARDÁPIO abaixo — não calcule nem estime nada por conta própria além de somar o que já está listado.
- O cliente pode mudar de ideia a qualquer momento (trocar item, quantidade, endereço, forma de pagamento) — use atualizar_pedido de novo, o carrinho novo substitui o anterior.
- Antes de confirmar_pedido, sempre mostre um resumo completo em texto (itens, quantidades, valores, forma de entrega, endereço se houver, forma de pagamento) e espere confirmação explícita do cliente.
- Pergunte se o pedido deve usar o número de WhatsApp que está conversando ou outro telefone, e peça o nome do cliente, antes de confirmar.
- Se a forma de pagamento escolhida for Pix, informe a chave Pix abaixo e o valor total a pagar — nunca considere o pedido como pago só porque o cliente disse "já paguei" ou enviou um comprovante; isso fica para a equipe conferir depois.
- Se o cliente pedir para falar com uma pessoa, ou parecer confuso/insatisfeito e você não conseguir ajudar, chame transferir_para_humano.
- Se pedirem o cardápio em PDF, diga que vai enviar (o sistema cuida do envio do arquivo automaticamente).

INFORMAÇÕES DO RESTAURANTE:
- Nome: ${restaurant.name}
- Endereço: ${restaurant.address ?? "não informado"}
- Telefone: ${restaurant.phone ?? "não informado"}
- Chave Pix: ${restaurant.pixKey ?? "não configurada — se o cliente escolher Pix, avise que a equipe vai enviar a chave"}
- Formas de pagamento aceitas: ${paymentMethods || "não configurado"}
- Taxa de entrega padrão: ${restaurant.defaultDeliveryFee ? `R$ ${Number(restaurant.defaultDeliveryFee).toFixed(2)}` : "consulte a equipe"}
- Áreas de entrega: ${restaurant.deliveryAreasText ?? "não informado — se perguntarem, diga que vai confirmar com a equipe"}
- Horário de funcionamento:\n${formatOpeningHoursSummary(hours)}
- Está aberto agora? ${open ? "Sim" : "Não — informe educadamente que está fechado no momento e, se possível, quando reabre, mas ainda pode anotar o pedido se o cliente quiser deixar para mais tarde, deixando claro que só será preparado quando reabrir"}
${restaurant.faqText ? `\nPERGUNTAS FREQUENTES:\n${restaurant.faqText}` : ""}

CARDÁPIO DISPONÍVEL (use exatamente estes productId ao chamar atualizar_pedido):
${formatCatalogForPrompt(catalog)}

CARRINHO ATUAL DO CLIENTE:
${formatDraftCartForPrompt(draftCart)}`;
}

// ---------- tool handlers ----------

function buildToolHandlers(params: {
  restaurantId: string;
  phoneNumber: string;
  pushName: string | null;
  conversationId: string;
  instanceName: string;
  getDraftCart: () => DraftCart;
  setDraftCart: (cart: DraftCart) => Promise<void>;
}): Record<string, AgentToolHandler> {
  const { restaurantId, phoneNumber, conversationId, instanceName, getDraftCart, setDraftCart } = params;

  return {
    async atualizar_pedido(input) {
      const parsed = atualizarPedidoSchema.safeParse(input);
      if (!parsed.success) return { error: "Dados inválidos para atualizar o pedido." };
      const data = parsed.data;
      const current = getDraftCart();

      let items = current.items;
      if (data.items) {
        const catalog = await getCatalogForOrderForm(restaurantId);
        const productMap = new Map(catalog.flatMap((c) => c.products).map((p) => [p.id, p]));
        const resolved: DraftCartItem[] = [];
        for (const item of data.items) {
          const product = productMap.get(item.productId);
          if (!product) return { error: `Produto ${item.productId} não encontrado ou indisponível no cardápio.` };
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
      await setDraftCart(next);
      return { ok: true, carrinho: formatDraftCartForPrompt(next) };
    },

    async confirmar_pedido() {
      const cart = getDraftCart();
      if (cart.items.length === 0) return { error: "O carrinho está vazio — não há o que confirmar ainda." };
      if (!cart.fulfillment) return { error: "Falta saber se é entrega ou retirada." };
      if (cart.fulfillment === "DELIVERY" && !cart.address?.trim()) return { error: "Falta o endereço de entrega." };
      if (!cart.paymentMethod) return { error: "Falta saber a forma de pagamento." };
      if (!cart.customerName?.trim()) return { error: "Falta o nome do cliente." };

      const phone = (cart.phoneToUse?.trim() || phoneNumber).replace(/\D/g, "");

      const priced = await priceOrderItems(
        restaurantId,
        cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity, notes: i.notes, optionItemIds: i.optionItemIds })),
      );
      if ("error" in priced) return { error: priced.error };
      const { subtotal, itemsToCreate } = priced;

      const restaurant = await db.restaurant.findUniqueOrThrow({
        where: { id: restaurantId },
        select: { defaultDeliveryFee: true },
      });
      const deliveryFee = cart.fulfillment === "DELIVERY" ? Number(restaurant.defaultDeliveryFee ?? 0) : 0;
      const total = subtotal + deliveryFee;

      const customer = await db.customer.upsert({
        where: { restaurantId_phone: { restaurantId, phone } },
        update: { name: cart.customerName.trim() },
        create: { restaurantId, name: cart.customerName.trim(), phone },
      });

      const number = await nextOrderNumber(restaurantId);

      const order = await db.order.create({
        data: {
          restaurantId,
          customerId: customer.id,
          number,
          status: "NOVO",
          channel: "WHATSAPP_IA",
          fulfillment: cart.fulfillment,
          paymentMethod: cart.paymentMethod,
          paymentStatus: "PENDENTE",
          address: cart.fulfillment === "DELIVERY" ? cart.address?.trim() : null,
          subtotal,
          deliveryFee,
          total,
          items: { create: itemsToCreate },
          events: { create: [{ status: "NOVO" }] },
        },
      });

      await setDraftCart(emptyDraftCart());
      await db.conversation.update({ where: { id: conversationId }, data: { customerId: customer.id } });

      return {
        ok: true,
        numeroPedido: order.number,
        total: total.toFixed(2),
        mensagem: `Pedido #${order.number} criado com sucesso.`,
      };
    },

    async transferir_para_humano() {
      await db.conversation.update({ where: { id: conversationId }, data: { aiEnabled: false } });
      return { ok: true };
    },

    async enviar_cardapio_pdf() {
      const restaurant = await db.restaurant.findUniqueOrThrow({
        where: { id: restaurantId },
        select: { menuPdfBase64: true, menuPdfFileName: true },
      });
      if (!restaurant.menuPdfBase64) return { error: "Não há um cardápio em PDF cadastrado — informe o cliente que pode consultar os produtos por aqui mesmo." };
      try {
        await sendDocument(instanceName, phoneNumber, restaurant.menuPdfBase64, restaurant.menuPdfFileName ?? "cardapio.pdf");
        return { ok: true };
      } catch (err) {
        console.error("Falha ao enviar PDF do cardápio via Evolution API:", err);
        return { error: "Não foi possível enviar o PDF agora." };
      }
    },
  };
}

// ---------- entry point ----------

export async function processConversationMessage(params: {
  restaurantId: string;
  phoneNumber: string;
  pushName: string | null;
  text: string;
  whatsappMessageId: string | null;
  instanceName: string;
}) {
  const { restaurantId, phoneNumber, pushName, text, whatsappMessageId, instanceName } = params;

  // Idempotency: if we've already recorded a message with this WhatsApp id,
  // this is a redelivery (or an echo) — do nothing.
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
    data: {
      conversationId: conversation.id,
      direction: "IN",
      content: text,
      whatsappMessageId: whatsappMessageId ?? undefined,
    },
  });

  if (!conversation.aiEnabled) return; // handed off to a human — the agent stays silent

  const restaurant = await db.restaurant.findUnique({ where: { id: restaurantId }, select: { aiEnabled: true } });
  if (!restaurant?.aiEnabled) return; // agent turned off for this restaurant entirely

  let draftCart = readDraftCart(conversation.draftCart as Prisma.JsonValue | null);
  const setDraftCart = async (cart: DraftCart) => {
    draftCart = cart;
    await db.conversation.update({
      where: { id: conversation.id },
      data: { draftCart: cart as unknown as Prisma.InputJsonValue },
    });
  };

  const recentMessages = await db.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: 21, // last 20 turns + the one just inserted above
  });
  const history: AgentTurn[] = recentMessages
    .slice(1) // drop the message just recorded — it's passed separately as userMessage
    .reverse()
    .map((m) => ({ role: m.direction === "IN" ? "user" : "assistant", content: m.content }));

  const systemPrompt = await buildSystemPrompt(restaurantId, draftCart);
  const toolHandlers = buildToolHandlers({
    restaurantId,
    phoneNumber,
    pushName,
    conversationId: conversation.id,
    instanceName,
    getDraftCart: () => draftCart,
    setDraftCart,
  });

  let reply: string;
  try {
    reply = await runWhatsappAgent({ systemPrompt, history, userMessage: text, tools: TOOLS, toolHandlers });
  } catch (err) {
    console.error("Falha ao processar mensagem do agente de WhatsApp:", err);
    reply = "Desculpe, tive um problema para responder agora. Um atendente vai continuar por aqui em breve.";
  }

  await db.message.create({ data: { conversationId: conversation.id, direction: "OUT", content: reply } });

  try {
    await sendTextMessage(instanceName, phoneNumber, reply);
  } catch (err) {
    console.error("Falha ao enviar resposta via Evolution API:", err);
  }
}
