import "server-only";

import { z } from "zod";

import { db } from "@/lib/db";
import { normalizeOpeningHours, isOpenNow, formatOpeningHoursSummary } from "@/lib/opening-hours";
import { getCatalogForOrderForm, type CatalogCategory } from "@/server/queries/orders";
import { priceOrderItems, nextOrderNumber } from "@/server/orders/pricing";
import { sendDocument, fetchMediaBase64 } from "@/server/integrations/evolution/client";
import { sendAndRecordOutboundMessage } from "@/server/integrations/evolution/outbound-message";
import { PAYMENT_METHOD_LABELS } from "@/lib/order-flow";
import { extractRating } from "@/lib/feedback-rating";
import { HUMAN_HANDOFF_IDLE_MS } from "@/lib/whatsapp-handoff";
import { publishNewOrder } from "@/server/realtime/order-events";
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

async function buildSystemPrompt(restaurantId: string, phoneNumber: string, draftCart: DraftCart) {
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

  // Look up the real customer record (not just conversation history) so a
  // returning customer is recognized reliably even if their first order was
  // outside the rolling message-history window loaded below.
  const existingCustomer = await db.customer.findFirst({
    where: { restaurantId, phone: phoneNumber.replace(/\D/g, "") },
    select: { name: true, phone: true },
  });
  const lastOrderWithAddress = existingCustomer
    ? await db.order.findFirst({
        where: { restaurantId, customer: { phone: existingCustomer.phone }, address: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { address: true },
      })
    : null;
  const customerSection = existingCustomer
    ? `- Já cadastrado? Sim — nome: ${existingCustomer.name}, telefone: ${existingCustomer.phone}\n  Já é o mesmo número que está conversando agora, então o telefone do pedido já está resolvido — não precisa perguntar "posso usar este número?" de novo. Use esse nome e telefone automaticamente, sem perguntar de novo — só pergunte de novo se o cliente disser que quer mudar.${
        lastOrderWithAddress?.address
          ? `\n- Último endereço de entrega usado: ${lastOrderWithAddress.address}\n  Se o pedido for entrega, pergunte se é pra usar esse mesmo endereço antes de pedir um novo.`
          : ""
      }`
    : "- Já cadastrado? Não — é a primeira vez que esse número entra em contato. Pergunte o nome e confirme o telefone normalmente.";

  return `Você é o atendente virtual do restaurante "${restaurant.name}", conversando pelo WhatsApp. Fale de forma natural, cordial e objetiva, como uma pessoa de verdade — nunca ofereça um menu numerado tipo "digite 1 para...".

REGRAS INEGOCIÁVEIS:
- Nunca invente produto, preço, disponibilidade, promoção ou informação que não esteja explicitamente no CARDÁPIO ou nas informações abaixo. Se não souber algo, diga que vai verificar com a equipe, e chame a ferramenta transferir_para_humano se o cliente insistir.
- Preços e disponibilidade vêm sempre do CARDÁPIO abaixo — não calcule nem estime nada por conta própria além de somar o que já está listado.
- O cliente pode mudar de ideia a qualquer momento (trocar item, quantidade, endereço, forma de pagamento) — use atualizar_pedido de novo, o carrinho novo substitui o anterior.
- Faça UMA pergunta por mensagem sempre que possível. Só junte duas perguntas na mesma mensagem quando forem sobre o mesmo assunto (ex.: "Prefere Pix ou cartão? Se for cartão, na entrega?" é aceitável — é tudo sobre pagamento). Nunca junte perguntas de assuntos diferentes (ex.: nome, telefone e endereço) numa mensagem só — pergunte cada uma na sua vez, como uma recepcionista faria.
- Nunca pergunte de novo algo que o cliente já respondeu nesta conversa, que já esteja em CARRINHO ATUAL DO CLIENTE abaixo, ou que já esteja na seção CLIENTE abaixo (nome, telefone, endereço) — reaproveite o que já foi dito em vez de repetir a pergunta.
- Antes de confirmar_pedido você precisa saber (pulando o que já estiver em CLIENTE ou já informado nesta conversa, cada pergunta restante na sua própria mensagem): o nome do cliente (só se ainda não estiver em CLIENTE); se o pedido deve usar este número de WhatsApp ou outro telefone — só pergunte isso para cliente novo, com "Posso usar este número do WhatsApp como telefone para o pedido?"; o endereço, se for entrega; e a forma de pagamento. Só depois de ter tudo isso, mostre um resumo completo em texto (itens, quantidades, valores, forma de entrega, endereço se houver, forma de pagamento) e espere confirmação explícita antes de chamar confirmar_pedido.
- Forma de pagamento — cada uma tem um fluxo diferente, siga exatamente:
  - Pix: informe a chave Pix abaixo e o valor total a pagar, e peça para o cliente enviar o comprovante em foto pelo WhatsApp assim que pagar. Nunca considere o pedido como pago só porque o cliente disse "já paguei" ou só porque enviou uma foto — o comprovante fica com a equipe pra conferir, você nunca confirma pagamento sozinho.
  - Cartão, dinheiro ou qualquer outro método presencial: informe que o pagamento é feito na entrega (se for entrega) ou na retirada (se for retirada) — nunca peça comprovante nem trate como pago.
- Se o cliente disser algo como "pode colocar outro nome nesse pedido" ou "usa outro nome dessa vez", use esse nome só para o pedido atual (chame atualizar_pedido só com o customerName pedido) — não é preciso avisar que o cadastro permanente não muda, isso é tratado automaticamente. Trocar o nome do pedido NÃO significa trocar o telefone — nunca envie phoneToUse nesse caso, a menos que o cliente diga um telefone explicitamente.
- Nunca invente, adivinhe ou "complete" um número de telefone. Só preencha phoneToUse quando o cliente literalmente disser os dígitos de um telefone — em qualquer outra situação, deixe phoneToUse de fora da chamada (o sistema usa automaticamente o número real deste WhatsApp).
- Se o cliente pedir para falar com uma pessoa, ou parecer confuso/insatisfeito e você não conseguir ajudar, chame transferir_para_humano.
- Se pedirem o cardápio em PDF, diga que vai enviar (o sistema cuida do envio do arquivo automaticamente).

CLIENTE:
${customerSection}

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

      // cart.phoneToUse sometimes ends up as a phrase like "este número"
      // instead of an actual number (the model describing the customer's
      // answer rather than quoting digits) — stripping non-digits from
      // that would silently produce an empty phone, breaking every
      // downstream WhatsApp notification for this order. Only trust it
      // when it actually contains something phone-shaped; otherwise fall
      // back to the real WhatsApp number this conversation is happening on.
      //
      // Also seen in testing: the model reformatting the real number (e.g.
      // dropping the "55" country code into a local "(11) 9xxxx-xxxx" style)
      // and slipping a digit in the process — not a deliberately different
      // phone, just a transcription error. Compare only the last 8 digits
      // (the actual subscriber number, immune to country/area-code framing
      // differences) — near-identical there means "same person", regardless
      // of a country/area-code prefix mismatch.
      const realPhoneDigits = phoneNumber.replace(/\D/g, "");
      const phoneToUseDigits = cart.phoneToUse?.replace(/\D/g, "") ?? "";
      const CORE_LEN = 8;
      const realCore = realPhoneDigits.slice(-CORE_LEN);
      const candidateCore = phoneToUseDigits.slice(-CORE_LEN);
      const isNearDuplicateOfRealNumber =
        candidateCore.length === CORE_LEN &&
        [...candidateCore].filter((ch, i) => ch !== realCore[i]).length <= 1;
      const phone =
        phoneToUseDigits.length >= 8 && !isNearDuplicateOfRealNumber ? phoneToUseDigits : realPhoneDigits;

      // Safety net: a recognized customer's name should already be in the
      // cart (the prompt tells the model to reuse it), but fall back to the
      // registered name directly if the model ever forgets to copy it over.
      const existingCustomer = await db.customer.findFirst({ where: { restaurantId, phone } });
      const requestedName = cart.customerName?.trim() || existingCustomer?.name;
      if (!requestedName) return { error: "Falta o nome do cliente." };

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

      // A name that differs from what's on file is treated as a one-off for
      // this order (e.g. "pode colocar outro nome nesse pedido") — it never
      // overwrites the customer's permanent registration.
      const nameDiffers = existingCustomer && existingCustomer.name !== requestedName;
      const customer = existingCustomer
        ? existingCustomer
        : await db.customer.create({ data: { restaurantId, name: requestedName, phone } });

      const number = await nextOrderNumber(restaurantId);

      // PIX stays PENDENTE ("aguardando pagamento") until a proof arrives;
      // in-person methods already tell staff exactly when they'll be paid.
      const paymentStatus =
        cart.paymentMethod === "PIX"
          ? "PENDENTE"
          : cart.fulfillment === "DELIVERY"
            ? "PAGAMENTO_NA_ENTREGA"
            : "PAGAMENTO_NA_RETIRADA";

      const order = await db.order.create({
        data: {
          restaurantId,
          customerId: customer.id,
          number,
          status: "NOVO",
          channel: "WHATSAPP_IA",
          fulfillment: cart.fulfillment,
          paymentMethod: cart.paymentMethod,
          paymentStatus,
          customerNameOverride: nameDiffers ? requestedName : null,
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
      publishNewOrder(restaurantId, order);

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

/**
 * If this phone number has a Feedback request awaiting a reply, treats this
 * inbound message as that reply instead of an ordering-agent turn: records
 * the text (and a best-effort rating), sends a short thank-you, and returns
 * true so the caller skips the rest of the turn. Returns false when there's
 * no pending feedback for this conversation — the normal flow continues.
 */
async function captureFeedbackReply(params: {
  restaurantId: string;
  phoneNumber: string;
  instanceName: string;
  text: string;
}): Promise<boolean> {
  const { restaurantId, phoneNumber, instanceName, text } = params;

  const pending = await db.feedback.findFirst({
    where: { restaurantId, phoneNumber, status: "SENT" },
    orderBy: { requestSentAt: "desc" },
  });
  if (!pending) return false;

  await db.feedback.update({
    where: { id: pending.id },
    data: {
      status: "RESPONDED",
      responseText: text,
      responseReceivedAt: new Date(),
      rating: extractRating(text),
    },
  });

  const thanks = "Muito obrigado pelo retorno! 😊 Isso nos ajuda bastante.";
  await sendAndRecordOutboundMessage({ restaurantId, phoneNumber, instanceName, text: thanks });

  return true;
}

/**
 * If this phone number has a WHATSAPP_IA order awaiting a Pix payment proof
 * (paymentMethod PIX, paymentStatus PENDENTE), treats an inbound image as
 * that proof: downloads/stores it and moves the order to
 * AGUARDANDO_CONFIRMACAO_PIX — never straight to PAGO, a staff member always
 * confirms via confirmPayment. Returns true when handled (short-circuits the
 * turn, same as captureFeedbackReply), false when there's no order waiting
 * for a proof (a generic reply is sent instead, without inventing further
 * behavior).
 */
async function capturePixProofImage(params: {
  restaurantId: string;
  phoneNumber: string;
  instanceName: string;
  image: { rawMessage: unknown; mimetype: string | null; caption: string | null };
}): Promise<boolean> {
  const { restaurantId, phoneNumber, instanceName, image } = params;

  const order = await db.order.findFirst({
    where: {
      restaurantId,
      channel: "WHATSAPP_IA",
      paymentMethod: "PIX",
      paymentStatus: "PENDENTE",
      customer: { phone: phoneNumber.replace(/\D/g, "") },
    },
    orderBy: { createdAt: "desc" },
  });

  let reply: string;
  if (!order) {
    reply = "Recebi sua imagem, mas não tenho nenhum pagamento Pix aguardando comprovante no momento. Se precisar de algo, me avise! 😊";
  } else {
    try {
      const media = await fetchMediaBase64(instanceName, image.rawMessage);
      if (!media.base64) throw new Error("Evolution API não retornou o conteúdo da imagem.");
      await db.order.update({
        where: { id: order.id },
        data: {
          pixProofBase64: media.base64,
          pixProofMimeType: media.mimetype ?? image.mimetype ?? "image/jpeg",
          pixProofReceivedAt: new Date(),
          paymentStatus: "AGUARDANDO_CONFIRMACAO_PIX",
        },
      });
      reply = `Recebi seu comprovante do pedido #${order.number}! 📄 Nossa equipe vai confirmar o pagamento em breve.`;
    } catch (err) {
      console.error("Falha ao baixar comprovante do Pix via Evolution API:", err);
      reply = "Recebi sua imagem, mas tive um problema pra processar o comprovante agora. Nossa equipe vai verificar por aqui mesmo.";
    }
  }

  await sendAndRecordOutboundMessage({ restaurantId, phoneNumber, instanceName, text: reply });

  return true;
}

/**
 * Called from the webhook for a `fromMe: true` MESSAGES_UPSERT event with
 * text — the connected WhatsApp number echoes back everything sent on it,
 * automated or not, indistinguishably. A message whose whatsappMessageId
 * already exists (recorded by sendAndRecordOutboundMessage) is our own
 * automated send echoing back — ignored here, so it's never mistaken for a
 * human reply. Anything else is a real person typing directly on the
 * connected phone: recorded as history, and treated exactly like
 * transferir_para_humano (aiEnabled: false) — the agent shouldn't also try
 * to answer the same customer a human is actively responding to. No-op if
 * this phone number has no Conversation yet — a human proactively messaging
 * a number that never contacted the restaurant isn't the ordering agent's
 * concern.
 */
export async function recordStaffReply(params: {
  restaurantId: string;
  phoneNumber: string;
  text: string;
  whatsappMessageId: string | null;
}) {
  const { restaurantId, phoneNumber, text, whatsappMessageId } = params;

  if (whatsappMessageId) {
    const existing = await db.message.findUnique({ where: { whatsappMessageId } });
    if (existing) return; // echo of a message we sent ourselves
  }

  const conversation = await db.conversation.findUnique({ where: { restaurantId_phoneNumber: { restaurantId, phoneNumber } } });
  if (!conversation) return;

  await db.conversation.update({
    where: { id: conversation.id },
    data: { aiEnabled: false, lastMessageAt: new Date() },
  });
  await db.message.create({
    data: { conversationId: conversation.id, direction: "OUT", content: text, whatsappMessageId: whatsappMessageId ?? undefined },
  });
}

export async function processConversationMessage(params: {
  restaurantId: string;
  phoneNumber: string;
  pushName: string | null;
  text: string | null;
  image?: { rawMessage: unknown; mimetype: string | null; caption: string | null } | null;
  whatsappMessageId: string | null;
  instanceName: string;
}) {
  const { restaurantId, phoneNumber, pushName, text, image, whatsappMessageId, instanceName } = params;

  // Idempotency: if we've already recorded a message with this WhatsApp id,
  // this is a redelivery (or an echo) — do nothing.
  if (whatsappMessageId) {
    const existing = await db.message.findUnique({ where: { whatsappMessageId } });
    if (existing) return;
  }

  const existingConversation = await db.conversation.findUnique({
    where: { restaurantId_phoneNumber: { restaurantId, phoneNumber } },
  });

  // Auto-resume: a handed-off conversation that's gone genuinely quiet (no
  // message from either side) for HUMAN_HANDOFF_IDLE_MS is treated as a new
  // contact — the agent takes this message normally instead of staying
  // silent forever. An actively-ongoing human exchange never reaches this,
  // since lastMessageAt keeps resetting on every message from either side
  // (see sendAndRecordOutboundMessage and recordStaffReply below). Staff can
  // still end a handoff immediately at any time via the manual toggle
  // (setConversationAiEnabled) — this is only the safety net for when nobody
  // does that.
  const shouldAutoResume =
    !!existingConversation &&
    !existingConversation.aiEnabled &&
    Date.now() - existingConversation.lastMessageAt.getTime() >= HUMAN_HANDOFF_IDLE_MS;

  const conversation = await db.conversation.upsert({
    where: { restaurantId_phoneNumber: { restaurantId, phoneNumber } },
    update: {
      contactName: pushName ?? undefined,
      lastMessageAt: new Date(),
      ...(shouldAutoResume ? { aiEnabled: true } : {}),
    },
    create: { restaurantId, phoneNumber, contactName: pushName, aiEnabled: true },
  });

  await db.message.create({
    data: {
      conversationId: conversation.id,
      direction: "IN",
      content: text ?? image?.caption ?? "[imagem]",
      whatsappMessageId: whatsappMessageId ?? undefined,
    },
  });

  // An inbound image is treated as a Pix payment proof (if one is expected)
  // — never as an ordering-agent turn, since the agent has no vision here.
  if (image) {
    await capturePixProofImage({ restaurantId, phoneNumber, instanceName, image });
    return;
  }
  if (!text) return; // nothing else to process (shouldn't happen — the webhook only forwards text-or-image)

  // Capture a reply to a pending post-order feedback request, if there is
  // one — this runs regardless of aiEnabled (collecting feedback isn't the
  // ordering agent taking over, just recording data) and short-circuits
  // the rest of this turn: the ordering agent never runs for this message.
  const handledAsFeedback = await captureFeedbackReply({ restaurantId, phoneNumber, instanceName, text });
  if (handledAsFeedback) return;

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

  const systemPrompt = await buildSystemPrompt(restaurantId, phoneNumber, draftCart);
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

  await sendAndRecordOutboundMessage({
    restaurantId,
    phoneNumber,
    instanceName,
    text: reply,
    customerId: conversation.customerId ?? undefined,
  });
}
