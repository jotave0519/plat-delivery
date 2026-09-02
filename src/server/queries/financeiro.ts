import "server-only";

import { db } from "@/lib/db";
import { PAYMENT_METHOD_LABELS } from "@/lib/order-flow";

export type FinanceiroPeriod = "hoje" | "7dias" | "30dias" | "personalizado";

function resolveRange(period: FinanceiroPeriod, from?: string, to?: string) {
  const now = new Date();

  if (period === "personalizado" && from && to) {
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T23:59:59.999`);
    return { start, end };
  }

  let start: Date;
  if (period === "hoje") {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
  } else if (period === "7dias") {
    start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else {
    start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  return { start, end: now };
}

export type FinancialEntryItem = {
  id: string;
  type: "RECEITA" | "DESPESA";
  category: string;
  amount: number;
  description: string | null;
  date: Date;
};

export type FinanceiroData = {
  faturamento: number;
  pedidos: number;
  ticketMedio: number;
  despesasTotal: number;
  receitaManualTotal: number;
  resultado: number;
  aReceber: number;
  recebimentos: { name: string; amount: number; pct: string }[];
  entries: FinancialEntryItem[];
};

/**
 * Faturamento comes from real Order rows (same rule as the Dashboard: sum
 * of non-cancelled orders' total) — FinancialEntry is only for manual
 * entries (mostly despesas; RECEITA exists for the rare case of money that
 * didn't come through an Order).
 */
export async function getFinanceiroData(
  restaurantId: string,
  period: FinanceiroPeriod,
  from?: string,
  to?: string,
): Promise<FinanceiroData> {
  const { start, end } = resolveRange(period, from, to);

  const [orderAgg, pendingAgg, paymentGroups, entries] = await Promise.all([
    db.order.aggregate({
      where: { restaurantId, createdAt: { gte: start, lte: end }, status: { not: "CANCELADO" } },
      _sum: { total: true },
      _count: { _all: true },
    }),
    db.order.aggregate({
      where: {
        restaurantId,
        createdAt: { gte: start, lte: end },
        // "a receber" = anything not yet paid — includes PENDENTE plus the
        // WhatsApp-agent-specific statuses (Pix awaiting confirmation,
        // payment on delivery/pickup), all of which are money not in hand yet.
        paymentStatus: { not: "PAGO" },
        status: { not: "CANCELADO" },
      },
      _sum: { total: true },
    }),
    db.order.groupBy({
      by: ["paymentMethod"],
      where: { restaurantId, createdAt: { gte: start, lte: end }, paymentStatus: "PAGO" },
      _sum: { total: true },
    }),
    db.financialEntry.findMany({
      where: { restaurantId, date: { gte: start, lte: end } },
      orderBy: { date: "desc" },
    }),
  ]);

  const faturamento = Number(orderAgg._sum.total ?? 0);
  const pedidos = orderAgg._count._all;
  const ticketMedio = pedidos > 0 ? faturamento / pedidos : 0;
  const aReceber = Number(pendingAgg._sum.total ?? 0);

  const despesasTotal = entries.filter((e) => e.type === "DESPESA").reduce((sum, e) => sum + Number(e.amount), 0);
  const receitaManualTotal = entries.filter((e) => e.type === "RECEITA").reduce((sum, e) => sum + Number(e.amount), 0);
  const resultado = faturamento + receitaManualTotal - despesasTotal;

  const totalRecebido = paymentGroups.reduce((sum, g) => sum + Number(g._sum.total ?? 0), 0);
  const recebimentos = paymentGroups
    .map((g) => {
      const amount = Number(g._sum.total ?? 0);
      return {
        name: PAYMENT_METHOD_LABELS[g.paymentMethod] ?? g.paymentMethod,
        amount,
        pct: totalRecebido ? `${Math.round((amount / totalRecebido) * 100)}%` : "0%",
      };
    })
    .sort((a, b) => b.amount - a.amount);

  return {
    faturamento,
    pedidos,
    ticketMedio,
    despesasTotal,
    receitaManualTotal,
    resultado,
    aReceber,
    recebimentos,
    entries: entries.map((e) => ({
      id: e.id,
      type: e.type,
      category: e.category,
      amount: Number(e.amount),
      description: e.description,
      date: e.date,
    })),
  };
}
