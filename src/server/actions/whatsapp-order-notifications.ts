import "server-only";

import { db } from "@/lib/db";
import { sendAndRecordOutboundMessage } from "@/server/integrations/evolution/outbound-message";
import { resolveConnectedInstance } from "@/server/integrations/evolution/connection";
import type { OrderStatus } from "@/generated/prisma";

/**
 * Outbound status-change messages, sent only for orders that came from the
 * WhatsApp agent itself (channel === "WHATSAPP_IA") — a manually/counter-
 * created order never triggers this, by design (confirmed with the
 * restaurant owner). Called from src/server/actions/orders.ts right after
 * advanceOrderStatus/cancelOrder's own transaction commits — best-effort,
 * never blocks or rolls back the status change: a failed WhatsApp send
 * (not connected, Evolution API down) just gets logged.
 *
 * sendTextMessage's exact request shape is still unconfirmed against the
 * real Evolution API v2 (see the comment on that function) — this is the
 * other place besides the webhook payload shape that needs a live-WhatsApp
 * smoke test once a number is actually connected.
 */

const STATUS_MESSAGES: Partial<Record<OrderStatus, (orderNumber: number) => string>> = {
  EM_PREPARO: (n) => `Seu pedido #${n} foi confirmado! Já estamos preparando tudo. 🍕`,
  PRONTO: (n) => `Seu pedido #${n} está pronto! 👨‍🍳`,
  EM_ENTREGA: (n) => `Seu pedido #${n} saiu para entrega! 🛵`,
  CONCLUIDO: (n) => `Seu pedido #${n} foi concluído. Obrigado pela preferência! ❤️`,
};

export async function notifyOrderStatusChange(orderId: string) {
  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: {
        number: true,
        status: true,
        channel: true,
        restaurantId: true,
        customer: { select: { id: true, phone: true } },
      },
    });
    if (!order || order.channel !== "WHATSAPP_IA") return;

    const phone = order.customer?.phone;
    const messageBuilder = STATUS_MESSAGES[order.status];
    if (!phone || !messageBuilder) return;

    const instanceName = await resolveConnectedInstance(order.restaurantId);
    if (!instanceName) return;

    await sendAndRecordOutboundMessage({
      restaurantId: order.restaurantId,
      phoneNumber: phone,
      instanceName,
      text: messageBuilder(order.number),
      customerId: order.customer?.id,
    });
  } catch (err) {
    console.error("Falha ao notificar cliente sobre mudança de status do pedido:", err);
  }
}

export async function notifyOrderCancelled(orderId: string, reason: string | null) {
  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: { number: true, channel: true, restaurantId: true, customer: { select: { id: true, phone: true } } },
    });
    if (!order || order.channel !== "WHATSAPP_IA") return;

    const phone = order.customer?.phone;
    if (!phone) return;

    const instanceName = await resolveConnectedInstance(order.restaurantId);
    if (!instanceName) return;

    const text = reason
      ? `Infelizmente, tivemos um imprevisto e seu pedido #${order.number} precisou ser cancelado.\n\nMotivo: ${reason}\n\nPedimos desculpas pelo transtorno.`
      : `Infelizmente, tivemos um imprevisto e seu pedido #${order.number} precisou ser cancelado. Pedimos desculpas pelo transtorno.`;

    await sendAndRecordOutboundMessage({
      restaurantId: order.restaurantId,
      phoneNumber: phone,
      instanceName,
      text,
      customerId: order.customer?.id,
    });
  } catch (err) {
    console.error("Falha ao notificar cliente sobre cancelamento do pedido:", err);
  }
}
