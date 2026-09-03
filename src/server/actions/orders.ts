"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import { FLOW } from "@/lib/order-flow";
import { priceOrderItems, nextOrderNumber } from "@/server/orders/pricing";
import { notifyOrderStatusChange, notifyOrderCancelled } from "@/server/actions/whatsapp-order-notifications";
import { publishNewOrder } from "@/server/realtime/order-events";

function revalidateOrderPaths(orderId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/pedidos");
  if (orderId) revalidatePath(`/pedidos/${orderId}`);
}

/**
 * Advances one order to the next step of its status flow and logs the
 * transition to OrderEvent (used for the "Tempos" analytics on the
 * dashboard). Scoped to the caller's restaurant — an id from another
 * tenant simply won't be found.
 */
export async function advanceOrderStatus(orderId: string) {
  const tenant = await getTenant();

  const order = await db.order.findFirst({
    where: { id: orderId, restaurantId: tenant.restaurantId },
    select: { id: true, status: true, channel: true, customerId: true, customer: { select: { phone: true } } },
  });
  if (!order) return;

  const next = FLOW[order.status].next;
  if (!next) return;

  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data: { status: next } });
    await tx.orderEvent.create({ data: { orderId: order.id, status: next } });

    // Schedule the post-order feedback request the moment a WhatsApp-agent
    // order is concluded — durable in the DB (not in-memory) so it survives
    // a deploy/restart; src/server/feedback/scheduler.ts's poller picks it
    // up once dueAt passes. upsert (not create) so a hypothetical racing
    // double-call never fails the whole transaction over a duplicate row.
    if (next === "CONCLUIDO" && order.channel === "WHATSAPP_IA" && order.customer?.phone) {
      await tx.feedback.upsert({
        where: { orderId: order.id },
        update: {},
        create: {
          restaurantId: tenant.restaurantId,
          orderId: order.id,
          customerId: order.customerId,
          phoneNumber: order.customer.phone,
          dueAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
        },
      });
    }
  });

  revalidateOrderPaths(order.id);
  // Best-effort (the function itself never throws) — awaited so it reliably
  // runs to completion rather than racing the request's response. No-ops
  // for anything not from the WhatsApp agent (see the function's comment).
  await notifyOrderStatusChange(order.id);
}

/** Cancels an order still in progress. `reason` is optional — a staff member can cancel without giving one. No-op on an already-finished order. */
export async function cancelOrder(orderId: string, reason?: string) {
  const tenant = await getTenant();

  const order = await db.order.findFirst({
    where: { id: orderId, restaurantId: tenant.restaurantId },
    select: { id: true, status: true },
  });
  if (!order || order.status === "CONCLUIDO" || order.status === "CANCELADO") return;

  const cancelReason = reason?.trim() || null;

  await db.$transaction([
    db.order.update({ where: { id: order.id }, data: { status: "CANCELADO", cancelReason } }),
    db.orderEvent.create({ data: { orderId: order.id, status: "CANCELADO" } }),
  ]);

  revalidateOrderPaths(order.id);
  await notifyOrderCancelled(order.id, cancelReason);
}

/**
 * Staff confirms a payment from the platform — the only way an order's
 * paymentStatus ever becomes PAGO from a non-PAGO state. Receiving a Pix
 * proof image never does this automatically (see capturePixProofImage in
 * atendimento-ia-conversa.ts) — a human always makes the call.
 */
export async function confirmPayment(orderId: string) {
  const tenant = await getTenant();

  const order = await db.order.findFirst({
    where: { id: orderId, restaurantId: tenant.restaurantId },
    select: { id: true, paymentStatus: true },
  });
  if (!order || order.paymentStatus === "PAGO") return;

  await db.order.update({ where: { id: order.id }, data: { paymentStatus: "PAGO" } });
  revalidateOrderPaths(order.id);
}

/** Customer picker in the manual order form — name/phone search, tenant-scoped. */
export async function searchCustomers(query: string) {
  const tenant = await getTenant();
  const q = query.trim();
  if (!q) return [];

  const customers = await db.customer.findMany({
    where: {
      restaurantId: tenant.restaurantId,
      OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }],
    },
    orderBy: { name: "asc" },
    take: 8,
  });

  return customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone, address: c.address }));
}

const createManualOrderSchema = z.object({
  customer: z.union([
    z.object({ id: z.string().min(1) }),
    z.object({ name: z.string().min(1), phone: z.string().optional() }),
  ]),
  channel: z.enum(["TELEFONE", "BALCAO"]),
  fulfillment: z.enum(["DELIVERY", "RETIRADA"]),
  address: z.string().optional(),
  paymentMethod: z.enum(["PIX", "CARTAO", "DINHEIRO", "VALE_REFEICAO"]),
  paymentStatus: z.enum(["PENDENTE", "PAGO"]),
  deliveryFee: z.number().min(0).max(500),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1).max(50),
        notes: z.string().optional(),
        optionItemIds: z.array(z.string()).optional(),
      }),
    )
    .min(1, "O pedido precisa de pelo menos um item."),
});

export type CreateManualOrderInput = z.infer<typeof createManualOrderSchema>;

/**
 * Manual order creation (attendant on the phone / at the counter). Item and
 * option prices are always re-read from the database — the client only
 * sends ids and quantities, never prices, so a tampered request can't
 * change what the order actually charges.
 */
export async function createManualOrder(input: CreateManualOrderInput) {
  const tenant = await getTenant();
  const parsed = createManualOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  if (data.fulfillment === "DELIVERY" && !data.address?.trim()) {
    return { error: "Endereço é obrigatório para entrega." };
  }

  let customerId: string;
  if ("id" in data.customer) {
    const existing = await db.customer.findFirst({
      where: { id: data.customer.id, restaurantId: tenant.restaurantId },
    });
    if (!existing) return { error: "Cliente não encontrado." };
    customerId = existing.id;
  } else {
    const phone = data.customer.phone?.trim() || null;
    // Dedup by phone only when one was actually given — there's no natural
    // key to upsert on for a name-only walk-in customer, so that case is
    // always a fresh create (the user can merge duplicates later via
    // Clientes if needed).
    const customer = phone
      ? await db.customer.upsert({
          where: { restaurantId_phone: { restaurantId: tenant.restaurantId, phone } },
          update: { name: data.customer.name },
          create: { restaurantId: tenant.restaurantId, name: data.customer.name, phone },
        })
      : await db.customer.create({
          data: { restaurantId: tenant.restaurantId, name: data.customer.name, phone: null },
        });
    customerId = customer.id;
  }

  const priced = await priceOrderItems(tenant.restaurantId, data.items);
  if ("error" in priced) return { error: priced.error };
  const { subtotal, itemsToCreate } = priced;

  const deliveryFee = data.fulfillment === "DELIVERY" ? data.deliveryFee : 0;
  const total = subtotal + deliveryFee;

  const number = await nextOrderNumber(tenant.restaurantId);

  const order = await db.order.create({
    data: {
      restaurantId: tenant.restaurantId,
      customerId,
      number,
      status: "NOVO",
      channel: data.channel,
      fulfillment: data.fulfillment,
      paymentMethod: data.paymentMethod,
      paymentStatus: data.paymentStatus,
      address: data.fulfillment === "DELIVERY" ? data.address?.trim() : null,
      notes: data.notes?.trim() || null,
      subtotal,
      deliveryFee,
      total,
      items: { create: itemsToCreate },
      events: { create: [{ status: "NOVO" }] },
    },
  });

  revalidateOrderPaths(order.id);
  publishNewOrder(tenant.restaurantId, order);
  redirect(`/pedidos/${order.id}`);
}
