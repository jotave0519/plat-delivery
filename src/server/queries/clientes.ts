import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";

export const CUSTOMERS_PAGE_SIZE = 20;

export type CustomerListItem = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  totalPedidos: number;
  valorGasto: number;
  ultimoPedido: Date | null;
};

/**
 * Stats (order count, spend, last order) come from one `groupBy` over the
 * page's customer ids, not a query per customer — cancelled orders are
 * excluded from spend/count (they aren't real revenue) but still show up
 * in a customer's order history on the detail page.
 */
export async function listCustomers(
  restaurantId: string,
  opts: { q?: string; page?: number },
): Promise<{ items: CustomerListItem[]; total: number; page: number; pageSize: number; hasMore: boolean }> {
  const page = Math.max(1, opts.page ?? 1);
  const where: Prisma.CustomerWhereInput = { restaurantId };

  const q = opts.q?.trim();
  if (q) {
    where.OR = [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }];
  }

  const [total, customers] = await Promise.all([
    db.customer.count({ where }),
    db.customer.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * CUSTOMERS_PAGE_SIZE,
      take: CUSTOMERS_PAGE_SIZE,
    }),
  ]);

  const ids = customers.map((c) => c.id);
  const stats = ids.length
    ? await db.order.groupBy({
        by: ["customerId"],
        where: { restaurantId, customerId: { in: ids }, status: { not: "CANCELADO" } },
        _count: { _all: true },
        _sum: { total: true },
        _max: { createdAt: true },
      })
    : [];
  const statsMap = new Map(stats.map((s) => [s.customerId, s]));

  const items: CustomerListItem[] = customers.map((c) => {
    const s = statsMap.get(c.id);
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      address: c.address,
      totalPedidos: s?._count._all ?? 0,
      valorGasto: Number(s?._sum.total ?? 0),
      ultimoPedido: s?._max.createdAt ?? null,
    };
  });

  return { items, total, page, pageSize: CUSTOMERS_PAGE_SIZE, hasMore: page * CUSTOMERS_PAGE_SIZE < total };
}

export type CustomerDetail = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  createdAt: Date;
  totalPedidos: number;
  valorGasto: number;
  ticketMedio: number;
  ultimoPedido: Date | null;
};

export async function getCustomerDetail(restaurantId: string, customerId: string): Promise<CustomerDetail | null> {
  // Neither query depends on the other's result — fetch in parallel.
  const [customer, agg] = await Promise.all([
    db.customer.findFirst({ where: { id: customerId, restaurantId } }),
    db.order.aggregate({
      where: { restaurantId, customerId, status: { not: "CANCELADO" } },
      _count: { _all: true },
      _sum: { total: true },
      _avg: { total: true },
      _max: { createdAt: true },
    }),
  ]);
  if (!customer) return null;

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    address: customer.address,
    notes: customer.notes,
    createdAt: customer.createdAt,
    totalPedidos: agg._count._all,
    valorGasto: Number(agg._sum.total ?? 0),
    ticketMedio: Number(agg._avg.total ?? 0),
    ultimoPedido: agg._max.createdAt,
  };
}
