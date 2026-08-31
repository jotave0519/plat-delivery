import "server-only";

import { db } from "@/lib/db";
import type { Fulfillment, OrderStatus, Prisma } from "@/generated/prisma";
import { CHANNEL_LABELS, LATE_THRESHOLD_MINUTES, PAYMENT_METHOD_LABELS } from "@/lib/order-flow";
import { minutesAgo } from "@/lib/format";
import { summarizeItems } from "@/lib/order-summary";

export const ORDERS_PAGE_SIZE = 20;

export type OrderListFilters = {
  status?: OrderStatus | "TODOS";
  q?: string;
  period?: "hoje" | "7dias" | "30dias" | "todos";
  page?: number;
  /** Restricts to one customer's history — used by /clientes/[id]. */
  customerId?: string;
};

export type OrderListItem = {
  id: string;
  number: number;
  clienteNome: string;
  canalLabel: string;
  pagamentoLabel: string;
  status: OrderStatus;
  fulfillment: Fulfillment;
  valor: number;
  resumo: string;
  observacao: string | null;
  endereco: string | null;
  createdAt: Date;
  minutosAtras: number;
  atrasado: boolean;
};

export async function listOrders(restaurantId: string, filters: OrderListFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const where: Prisma.OrderWhereInput = { restaurantId };

  if (filters.customerId) {
    where.customerId = filters.customerId;
  }

  if (filters.status && filters.status !== "TODOS") {
    where.status = filters.status;
  }

  if (filters.period && filters.period !== "todos") {
    const now = new Date();
    let start: Date;
    if (filters.period === "hoje") {
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
    } else if (filters.period === "7dias") {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    where.createdAt = { gte: start };
  }

  const q = filters.q?.trim();
  if (q) {
    const asNumber = Number(q.replace(/\D/g, ""));
    where.OR = [
      { customer: { name: { contains: q, mode: "insensitive" } } },
      ...(Number.isFinite(asNumber) && asNumber > 0 ? [{ number: asNumber }] : []),
    ];
  }

  const [total, orders] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      include: { customer: true, items: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * ORDERS_PAGE_SIZE,
      take: ORDERS_PAGE_SIZE,
    }),
  ]);

  const now = new Date();
  const items: OrderListItem[] = orders.map((o) => {
    const open = o.status !== "CONCLUIDO" && o.status !== "CANCELADO";
    const mins = minutesAgo(o.updatedAt, now);
    return {
      id: o.id,
      number: o.number,
      clienteNome: o.customer?.name ?? "Cliente balcão",
      canalLabel: CHANNEL_LABELS[o.channel] ?? o.channel,
      pagamentoLabel: `${PAYMENT_METHOD_LABELS[o.paymentMethod] ?? o.paymentMethod} ${o.paymentStatus === "PAGO" ? "pago" : "pendente"}`,
      status: o.status,
      fulfillment: o.fulfillment,
      valor: Number(o.total),
      resumo: summarizeItems(o.items),
      observacao: o.notes,
      endereco: o.address,
      createdAt: o.createdAt,
      minutosAtras: mins,
      atrasado: open && mins >= LATE_THRESHOLD_MINUTES,
    };
  });

  return { items, total, page, pageSize: ORDERS_PAGE_SIZE, hasMore: page * ORDERS_PAGE_SIZE < total };
}

export async function getOrderDetail(restaurantId: string, orderId: string) {
  return db.order.findFirst({
    where: { id: orderId, restaurantId },
    include: {
      customer: true,
      items: { include: { product: true, options: { include: { optionItem: true } } } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
}
export type OrderDetail = NonNullable<Awaited<ReturnType<typeof getOrderDetail>>>;

// ---------- catalog, for the manual order creation form ----------

export type CatalogOptionItem = { id: string; name: string; price: number };
export type CatalogOptionGroup = {
  id: string;
  name: string;
  required: boolean;
  multiple: boolean;
  items: CatalogOptionItem[];
};
export type CatalogProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  optionGroups: CatalogOptionGroup[];
};
export type CatalogCategory = { id: string; name: string; products: CatalogProduct[] };

export async function getCatalogForOrderForm(restaurantId: string): Promise<CatalogCategory[]> {
  const categories = await db.category.findMany({
    where: { restaurantId },
    orderBy: { position: "asc" },
    include: {
      products: {
        where: { isAvailable: true },
        orderBy: { position: "asc" },
        include: { optionGroups: { include: { items: true } } },
      },
    },
  });

  // Decimal fields aren't safely serializable across the Server → Client
  // Component boundary, so convert to plain numbers here (same pattern as
  // src/server/queries/dashboard.ts).
  return categories
    .filter((c) => c.products.length > 0)
    .map((c) => ({
      id: c.id,
      name: c.name,
      products: c.products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: Number(p.price),
        optionGroups: p.optionGroups.map((g) => ({
          id: g.id,
          name: g.name,
          required: g.required,
          multiple: g.multiple,
          items: g.items.map((i) => ({ id: i.id, name: i.name, price: Number(i.price) })),
        })),
      })),
    }));
}
