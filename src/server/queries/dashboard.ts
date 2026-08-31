import "server-only";

import { db } from "@/lib/db";
import type { OrderStatus } from "@/generated/prisma";
import { formatDelta, minutesAgo } from "@/lib/format";
import { CHANNEL_LABELS, LATE_THRESHOLD_MINUTES, PAYMENT_METHOD_LABELS } from "@/lib/order-flow";
import { summarizeItems } from "@/lib/order-summary";

export type Period = "hoje" | "7dias" | "30dias";

export const PERIOD_LABELS: Record<Period, string> = {
  hoje: "Hoje",
  "7dias": "7 dias",
  "30dias": "30 dias",
};

export type QueueOrder = {
  id: string;
  number: number;
  clienteNome: string;
  canalLabel: string;
  pagamentoLabel: string;
  status: OrderStatus;
  valor: number;
  resumo: string;
  observacao: string | null;
  minutosAtras: number;
  atrasado: boolean;
};

export type DashboardData = {
  period: Period;
  kpi: {
    faturamento: number;
    faturamentoDelta: ReturnType<typeof formatDelta>;
    pedidos: number;
    pedidosSub: string;
    ticketMedio: number;
    ticketMedioDelta: ReturnType<typeof formatDelta>;
  };
  alerts: {
    critical: { title: string; sub: string; actionLabel: string; positive: boolean; targetStatus?: OrderStatus };
    secondary: { title: string; sub: string }[];
  };
  pipeline: { status: OrderStatus; count: number; lateCount: number }[];
  queue: QueueOrder[];
  analytics: {
    volume: { label: string; count: number }[];
    canais: { name: string; count: number; pct: string }[];
    tempos: { prepMedio: number | null; entregaMedio: number | null; acimaDoPrometido: number };
    recebimentos: { name: string; amount: number; pct: string }[];
    resumo: { concluidos: number; cancelados: number; retirada: number; aReceberMarketplace: number };
  };
};

function periodRange(period: Period, now: Date) {
  const end = now;
  let start: Date;
  if (period === "hoje") {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
  } else if (period === "7dias") {
    start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else {
    start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  const duration = end.getTime() - start.getTime();
  return { start, end, prevStart: new Date(start.getTime() - duration), prevEnd: new Date(start.getTime()) };
}

const WEEKDAY_LABELS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function buildVolumeBuckets(period: Period, range: { start: Date; end: Date }, timestamps: Date[]) {
  if (period === "hoje") {
    if (timestamps.length === 0) return [];
    const hours = timestamps.map((d) => d.getHours());
    const minHour = Math.min(...hours);
    const maxHour = range.end.getHours();
    const buckets: { label: string; count: number }[] = [];
    for (let h = minHour; h <= maxHour; h++) {
      buckets.push({ label: `${h}h`, count: hours.filter((x) => x === h).length });
    }
    return buckets;
  }

  if (period === "7dias") {
    const days: { label: string; count: number; key: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(range.end);
      d.setDate(d.getDate() - i);
      days.push({ label: WEEKDAY_LABELS[d.getDay()], count: 0, key: d.toDateString() });
    }
    for (const ts of timestamps) {
      const bucket = days.find((d) => d.key === ts.toDateString());
      if (bucket) bucket.count += 1;
    }
    return days.map(({ label, count }) => ({ label, count }));
  }

  // 30dias: four weekly buckets counted from the start of the period.
  const weeks = [0, 1, 2, 3].map((i) => ({ label: `sem ${i + 1}`, count: 0 }));
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  for (const ts of timestamps) {
    const idx = Math.min(3, Math.floor((ts.getTime() - range.start.getTime()) / weekMs));
    if (idx >= 0) weeks[idx].count += 1;
  }
  return weeks;
}

export async function getDashboardData(restaurantId: string, period: Period): Promise<DashboardData> {
  const now = new Date();
  const range = periodRange(period, now);

  const [
    currentAgg,
    prevAgg,
    fulfillmentGroups,
    channelGroups,
    paymentGroups,
    statusGroups,
    marketplaceReceivable,
    timestamps,
    events,
    openOrders,
    lowStock,
    pausedProducts,
  ] = await Promise.all([
      db.order.aggregate({
        where: { restaurantId, createdAt: { gte: range.start, lte: range.end }, status: { not: "CANCELADO" } },
        _sum: { total: true },
        _count: { _all: true },
      }),
      db.order.aggregate({
        where: { restaurantId, createdAt: { gte: range.prevStart, lte: range.prevEnd }, status: { not: "CANCELADO" } },
        _sum: { total: true },
        _count: { _all: true },
      }),
      db.order.groupBy({
        by: ["fulfillment"],
        where: { restaurantId, createdAt: { gte: range.start, lte: range.end }, status: { not: "CANCELADO" } },
        _count: { _all: true },
      }),
      db.order.groupBy({
        by: ["channel"],
        where: { restaurantId, createdAt: { gte: range.start, lte: range.end }, status: { not: "CANCELADO" } },
        _count: { _all: true },
      }),
      db.order.groupBy({
        by: ["paymentMethod"],
        where: { restaurantId, createdAt: { gte: range.start, lte: range.end }, paymentStatus: "PAGO" },
        _sum: { total: true },
      }),
      db.order.groupBy({
        by: ["status"],
        where: { restaurantId, createdAt: { gte: range.start, lte: range.end } },
        _count: { _all: true },
      }),
      db.order.aggregate({
        where: {
          restaurantId,
          createdAt: { gte: range.start, lte: range.end },
          channel: "MARKETPLACE",
          paymentStatus: "PENDENTE",
        },
        _sum: { total: true },
      }),
      db.order.findMany({
        where: { restaurantId, createdAt: { gte: range.start, lte: range.end }, status: { not: "CANCELADO" } },
        select: { createdAt: true },
      }),
      db.orderEvent.findMany({
        where: { order: { restaurantId }, createdAt: { gte: range.start, lte: range.end } },
        select: { orderId: true, status: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      db.order.findMany({
        where: { restaurantId, status: { notIn: ["CONCLUIDO", "CANCELADO"] } },
        select: {
          id: true,
          number: true,
          channel: true,
          paymentMethod: true,
          paymentStatus: true,
          status: true,
          total: true,
          notes: true,
          updatedAt: true,
          customer: { select: { name: true } },
          items: { select: { quantity: true, product: { select: { name: true } } } },
        },
        orderBy: { createdAt: "asc" },
      }),
      db.stockItem.findMany({ where: { restaurantId }, select: { name: true, quantityOnHand: true, minQuantity: true } }),
      db.product.findMany({ where: { restaurantId, isAvailable: false }, select: { name: true } }),
    ]);

  // ---------- KPIs ----------
  const faturamento = Number(currentAgg._sum.total ?? 0);
  const prevFaturamento = Number(prevAgg._sum.total ?? 0);
  const pedidos = currentAgg._count._all;
  const prevPedidos = prevAgg._count._all;
  const ticketMedio = pedidos > 0 ? faturamento / pedidos : 0;
  const prevTicketMedio = prevPedidos > 0 ? prevFaturamento / prevPedidos : 0;

  const deliveryCount = fulfillmentGroups.find((g) => g.fulfillment === "DELIVERY")?._count._all ?? 0;
  const retiradaCount = fulfillmentGroups.find((g) => g.fulfillment === "RETIRADA")?._count._all ?? 0;

  // ---------- live operational state (period-independent) ----------
  const decorated: QueueOrder[] = openOrders.map((o) => {
    const mins = minutesAgo(o.updatedAt, now);
    return {
      id: o.id,
      number: o.number,
      clienteNome: o.customer?.name ?? "Cliente balcão",
      canalLabel: CHANNEL_LABELS[o.channel] ?? o.channel,
      pagamentoLabel: `${PAYMENT_METHOD_LABELS[o.paymentMethod] ?? o.paymentMethod} ${o.paymentStatus === "PAGO" ? "pago" : "pendente"}`,
      status: o.status,
      valor: Number(o.total),
      resumo: summarizeItems(o.items),
      observacao: o.notes,
      minutosAtras: mins,
      atrasado: mins >= LATE_THRESHOLD_MINUTES,
    };
  });

  const pipeline = (["NOVO", "AGUARDANDO_PAGAMENTO", "CONFIRMADO", "EM_PREPARO", "PRONTO", "EM_ENTREGA"] as OrderStatus[]).map(
    (status) => {
      const inStage = decorated.filter((o) => o.status === status);
      return { status, count: inStage.length, lateCount: inStage.filter((o) => o.atrasado).length };
    },
  );

  const lateOrders = decorated.filter((o) => o.atrasado).sort((a, b) => b.minutosAtras - a.minutosAtras);
  const pendingPayment = decorated.filter((o) => o.status === "AGUARDANDO_PAGAMENTO");
  const lowStockItems = lowStock.filter((s) => s.quantityOnHand.lte(s.minQuantity));

  const secondary: { title: string; sub: string }[] = [];
  if (pendingPayment.length) {
    const oldest = pendingPayment.reduce((a, b) => (a.minutosAtras > b.minutosAtras ? a : b));
    secondary.push({
      title: `${pendingPayment.length} pedido${pendingPayment.length > 1 ? "s" : ""} aguardando pagamento`,
      sub: `O mais antigo há ${oldest.minutosAtras} minutos`,
    });
  }
  for (const item of lowStockItems) {
    secondary.push({
      title: `${item.name} ${Number(item.quantityOnHand) === 0 ? "zerado" : "baixo"}`,
      sub: `${item.quantityOnHand} un · mínimo ${item.minQuantity} un`,
    });
  }
  for (const product of pausedProducts) {
    secondary.push({ title: `${product.name} pausado no cardápio`, sub: "Indisponível para pedidos" });
  }

  const critical = lateOrders[0]
    ? {
        title: `Pedido #${lateOrders[0].number} parado há ${lateOrders[0].minutosAtras} min`,
        sub: `${lateOrders[0].clienteNome} · ${lateOrders[0].pagamentoLabel} · ${lateOrders[0].canalLabel}`,
        actionLabel: "Ver pedido",
        positive: false,
        targetStatus: lateOrders[0].status,
      }
    : {
        title: "Nenhum pedido atrasado",
        sub: "A operação está dentro dos tempos esperados",
        actionLabel: "Ver a fila",
        positive: true,
      };

  // ---------- analytics tabs ----------
  const volume = buildVolumeBuckets(period, range, timestamps.map((t) => t.createdAt));

  const totalChannelCount = channelGroups.reduce((sum, g) => sum + g._count._all, 0);
  const canais = channelGroups
    .map((g) => ({
      name: CHANNEL_LABELS[g.channel] ?? g.channel,
      count: g._count._all,
      pct: totalChannelCount ? `${Math.round((g._count._all / totalChannelCount) * 100)}%` : "0%",
    }))
    .sort((a, b) => b.count - a.count);

  const totalReceived = paymentGroups.reduce((sum, g) => sum + Number(g._sum.total ?? 0), 0);
  const recebimentos = paymentGroups
    .map((g) => {
      const amount = Number(g._sum.total ?? 0);
      return {
        name: PAYMENT_METHOD_LABELS[g.paymentMethod] ?? g.paymentMethod,
        amount,
        pct: totalReceived ? `${Math.round((amount / totalReceived) * 100)}%` : "0%",
      };
    })
    .sort((a, b) => b.amount - a.amount);

  const eventsByOrder = new Map<string, { status: OrderStatus; createdAt: Date }[]>();
  for (const e of events) {
    const arr = eventsByOrder.get(e.orderId) ?? [];
    arr.push(e);
    eventsByOrder.set(e.orderId, arr);
  }
  const prepDurations: number[] = [];
  const deliveryDurations: number[] = [];
  for (const evs of eventsByOrder.values()) {
    const at = (status: OrderStatus) => evs.find((e) => e.status === status)?.createdAt;
    const preparoAt = at("EM_PREPARO");
    const prontoAt = at("PRONTO");
    const entregaAt = at("EM_ENTREGA");
    const concluidoAt = at("CONCLUIDO");
    if (preparoAt && prontoAt) prepDurations.push((prontoAt.getTime() - preparoAt.getTime()) / 60_000);
    if (entregaAt && concluidoAt) deliveryDurations.push((concluidoAt.getTime() - entregaAt.getTime()) / 60_000);
  }
  const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);

  const concluidos = statusGroups.find((g) => g.status === "CONCLUIDO")?._count._all ?? 0;
  const cancelados = statusGroups.find((g) => g.status === "CANCELADO")?._count._all ?? 0;

  return {
    period,
    kpi: {
      faturamento,
      faturamentoDelta: formatDelta(faturamento, prevFaturamento),
      pedidos,
      pedidosSub: `${deliveryCount} delivery · ${retiradaCount} retirada`,
      ticketMedio,
      ticketMedioDelta: formatDelta(ticketMedio, prevTicketMedio),
    },
    alerts: { critical, secondary },
    pipeline,
    queue: decorated,
    analytics: {
      volume,
      canais,
      tempos: { prepMedio: avg(prepDurations), entregaMedio: avg(deliveryDurations), acimaDoPrometido: lateOrders.length },
      recebimentos,
      resumo: {
        concluidos,
        cancelados,
        retirada: retiradaCount,
        aReceberMarketplace: Number(marketplaceReceivable._sum.total ?? 0),
      },
    },
  };
}
