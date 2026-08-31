import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";

import {
  PrismaClient,
  type Customer,
  type OrderChannel,
  type OrderStatus,
  type Fulfillment,
  type PaymentMethod,
  type PaymentStatus,
} from "../src/generated/prisma";
import { addSampleOptionGroups } from "./lib/sample-options";

// Standalone script (not the Next.js process), so load .env the same way
// prisma.config.ts does.
try {
  process.loadEnvFile(".env");
} catch {
  // no .env file — rely on already-set process.env
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

// ---------- small helpers ----------
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}
function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

async function main() {
  // Guard rail: this seed creates ~1200 fake orders and demo customers. It's
  // meant for a fresh/local database only — running it against a database
  // already in real use would mix fictitious data into real business data.
  // Require an explicit opt-in every time rather than trusting whoever runs
  // `npm run db:seed` to remember which database they're pointed at.
  if (process.env.ALLOW_SEED !== "true") {
    throw new Error(
      "Seed bloqueado: isso criaria pedidos/clientes fictícios. " +
        "Se você tem certeza de que este banco pode receber dados de demonstração " +
        "(ambiente novo/local, não um banco em uso real), defina ALLOW_SEED=true e rode de novo.",
    );
  }

  // ---------- tenant + owner ----------
  const restaurant = await db.restaurant.upsert({
    where: { slug: "casa-bonfim" },
    update: {},
    create: {
      name: "Casa Bonfim",
      slug: "casa-bonfim",
      phone: "(11) 4002-8922",
      address: "Rua das Palmeiras, 482 — Vila Bonfim, São Paulo/SP",
      pixKey: "financeiro@casabonfim.com.br",
      openingHours: {
        seg: "18:00-23:30",
        ter: "18:00-23:30",
        qua: "18:00-23:30",
        qui: "18:00-23:30",
        sex: "18:00-00:00",
        sab: "18:00-00:00",
        dom: "18:00-23:00",
      },
    },
  });

  const passwordHash = await bcrypt.hash("senha123", 10);
  await db.user.upsert({
    where: { email: "carla@casabonfim.com.br" },
    update: {},
    create: {
      restaurantId: restaurant.id,
      name: "Carla Bonfim",
      email: "carla@casabonfim.com.br",
      passwordHash,
      role: "OWNER",
    },
  });

  // ---------- menu ----------
  const catalogSpec: { category: string; items: { name: string; price: number }[] }[] = [
    {
      category: "Pizzas",
      items: [
        { name: "Pizza Margherita G", price: 55.9 },
        { name: "Pizza Calabresa G", price: 58.9 },
        { name: "Pizza Portuguesa M", price: 52.9 },
      ],
    },
    {
      category: "Burgers",
      items: [
        { name: "Burger Duplo", price: 32.0 },
        { name: "Burger Veggie", price: 29.9 },
        { name: "Batata Rústica", price: 18.0 },
      ],
    },
    {
      category: "Combos",
      items: [
        { name: "Combo Família", price: 109.0 },
        { name: "Combo Sushi 20 peças", price: 132.5 },
      ],
    },
    { category: "Esfihas", items: [{ name: "Esfiha de Carne", price: 8.5 }] },
    { category: "Asiática", items: [{ name: "Yakisoba de Frango", price: 38.0 }] },
    {
      category: "Bebidas",
      items: [
        { name: "Coca-Cola 2L", price: 12.0 },
        { name: "Suco Natural 500ml", price: 9.5 },
        { name: "Milkshake", price: 16.0 },
      ],
    },
  ];

  const products: { id: string; name: string; price: number }[] = [];
  for (const group of catalogSpec) {
    const category = await db.category.create({
      data: { restaurantId: restaurant.id, name: group.category },
    });
    for (const item of group.items) {
      const product = await db.product.create({
        data: {
          restaurantId: restaurant.id,
          categoryId: category.id,
          name: item.name,
          price: item.price,
        },
      });
      products.push({ id: product.id, name: product.name, price: item.price });
    }
  }

  await addSampleOptionGroups(db, restaurant.id);

  // Demonstrates the "produto pausado" alert on the dashboard.
  const burgerDuplo = products.find((p) => p.name === "Burger Duplo");
  if (burgerDuplo) {
    await db.product.update({ where: { id: burgerDuplo.id }, data: { isAvailable: false } });
  }

  // ---------- customers ----------
  const customerNames = [
    "Marina Alves",
    "Rafael Lima",
    "Sofia Nunes",
    "Camila Souza",
    "Ana Beatriz Rocha",
    "Diego Martins",
    "Lucas Ferreira",
    "Patrícia Gomes",
    "Jonas Moreira",
    "Beatriz Cardoso",
  ];
  const customers: Customer[] = [];
  for (const [i, name] of customerNames.entries()) {
    const customer = await db.customer.upsert({
      where: { restaurantId_phone: { restaurantId: restaurant.id, phone: `1198877${1000 + i}` } },
      update: {},
      create: { restaurantId: restaurant.id, name, phone: `1198877${1000 + i}` },
    });
    customers.push(customer);
  }

  // ---------- stock ----------
  await db.stockItem.createMany({
    data: [
      { restaurantId: restaurant.id, name: "Embalagem de pizza G", unit: "un", quantityOnHand: 0, minQuantity: 100 },
      { restaurantId: restaurant.id, name: "Pão de burger", unit: "un", quantityOnHand: 180, minQuantity: 60 },
      { restaurantId: restaurant.id, name: "Queijo mussarela", unit: "kg", quantityOnHand: 12, minQuantity: 5 },
      { restaurantId: restaurant.id, name: "Refrigerante lata", unit: "un", quantityOnHand: 240, minQuantity: 48 },
    ],
  });

  // ---------- orders ----------
  const channels: { value: OrderChannel; weight: number }[] = [
    { value: "CARDAPIO_PROPRIO", weight: 54 },
    { value: "MARKETPLACE", weight: 32 },
    { value: "WHATSAPP_IA", weight: 14 },
  ];
  function pickChannel(): OrderChannel {
    const total = channels.reduce((sum, c) => sum + c.weight, 0);
    let roll = randInt(1, total);
    for (const c of channels) {
      roll -= c.weight;
      if (roll <= 0) return c.value;
    }
    return "CARDAPIO_PROPRIO";
  }

  let orderNumber = 1000;

  /** Creates one order with items and a status-transition history. */
  async function placeOrder(opts: {
    createdAt: Date;
    history: { status: OrderStatus; at: Date }[];
    channel: OrderChannel;
    paymentMethod: PaymentMethod;
    paymentStatus: PaymentStatus;
    notes?: string;
  }) {
    const itemCount = randInt(1, 3);
    const chosen = Array.from({ length: itemCount }, () => pick(products));
    const fulfillment: Fulfillment = Math.random() < 0.78 ? "DELIVERY" : "RETIRADA";
    const deliveryFee = fulfillment === "DELIVERY" ? 6.9 : 0;
    const customer = pick(customers);
    orderNumber += 1;

    const items = chosen.map((p) => ({ productId: p.id, quantity: randInt(1, 2), unitPrice: p.price }));
    const subtotal = items.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);
    const status = opts.history[opts.history.length - 1].status;

    const order = await db.order.create({
      data: {
        restaurantId: restaurant.id,
        customerId: customer.id,
        number: orderNumber,
        status,
        channel: opts.channel,
        fulfillment,
        paymentMethod: opts.paymentMethod,
        paymentStatus: opts.paymentStatus,
        address: fulfillment === "DELIVERY" ? "Rua Exemplo, 123 — São Paulo/SP" : null,
        notes: opts.notes,
        subtotal,
        deliveryFee,
        total: subtotal + deliveryFee,
        createdAt: opts.createdAt,
        updatedAt: opts.history[opts.history.length - 1].at,
        items: { create: items },
        events: { create: opts.history.map((h) => ({ status: h.status, createdAt: h.at })) },
      },
    });
    return order;
  }

  const now = new Date();

  // 29 days of closed history, ramping up towards the weekend, so the
  // Hoje / 7 dias / 30 dias views on the dashboard have real numbers.
  for (let daysAgo = 29; daysAgo >= 1; daysAgo--) {
    const day = new Date(now);
    day.setDate(day.getDate() - daysAgo);
    const isWeekend = day.getDay() === 5 || day.getDay() === 6;
    const count = randInt(isWeekend ? 45 : 20, isWeekend ? 70 : 40);

    for (let i = 0; i < count; i++) {
      const start = new Date(day);
      start.setHours(18, 0, 0, 0);
      const createdAt = addMinutes(start, randInt(0, 330));
      const cancelled = Math.random() < 0.02;

      const history: { status: OrderStatus; at: Date }[] = [{ status: "NOVO", at: createdAt }];
      if (cancelled) {
        history.push({ status: "CANCELADO", at: addMinutes(createdAt, randInt(2, 15)) });
      } else {
        let t = createdAt;
        for (const status of ["CONFIRMADO", "EM_PREPARO", "PRONTO", "EM_ENTREGA", "CONCLUIDO"] as const) {
          t = addMinutes(t, randInt(4, 14));
          history.push({ status, at: t });
        }
      }

      await placeOrder({
        createdAt,
        history,
        channel: pickChannel(),
        paymentMethod: pick<PaymentMethod>(["PIX", "CARTAO", "DINHEIRO", "VALE_REFEICAO"]),
        paymentStatus: "PAGO",
      });
    }
  }

  // Today: a batch of already-concluded orders for volume, plus a live
  // pipeline spread across every open status so the dashboard's "Operação
  // agora" board has something in every column right after seeding.
  const todayStart = new Date(now);
  todayStart.setHours(11, 0, 0, 0);
  const concludedToday = randInt(55, 75);
  for (let i = 0; i < concludedToday; i++) {
    const createdAt = addMinutes(todayStart, randInt(0, Math.max(1, (now.getTime() - todayStart.getTime()) / 60_000 - 40)));
    let t = createdAt;
    const history: { status: OrderStatus; at: Date }[] = [{ status: "NOVO", at: createdAt }];
    for (const status of ["CONFIRMADO", "EM_PREPARO", "PRONTO", "EM_ENTREGA", "CONCLUIDO"] as const) {
      t = addMinutes(t, randInt(4, 14));
      history.push({ status, at: t });
    }
    await placeOrder({
      createdAt,
      history,
      channel: pickChannel(),
      paymentMethod: pick<PaymentMethod>(["PIX", "CARTAO", "DINHEIRO", "VALE_REFEICAO"]),
      paymentStatus: "PAGO",
    });
  }

  const openPipeline: {
    minsAgo: number;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    notes?: string;
  }[] = [
    { minsAgo: 2, status: "NOVO", paymentStatus: "PAGO", notes: "Sem cebola" },
    { minsAgo: 6, status: "NOVO", paymentStatus: "PENDENTE" },
    { minsAgo: 22, status: "AGUARDANDO_PAGAMENTO", paymentStatus: "PENDENTE", notes: "Cliente avisou que vai pagar em 5 min" },
    { minsAgo: 9, status: "CONFIRMADO", paymentStatus: "PAGO", notes: "Wasabi à parte" },
    { minsAgo: 23, status: "EM_PREPARO", paymentStatus: "PAGO", notes: "Borda de catupiry" },
    { minsAgo: 12, status: "EM_PREPARO", paymentStatus: "PENDENTE" },
    { minsAgo: 24, status: "PRONTO", paymentStatus: "PAGO" },
    { minsAgo: 31, status: "EM_ENTREGA", paymentStatus: "PAGO" },
  ];

  const fullFlow: OrderStatus[] = ["NOVO", "AGUARDANDO_PAGAMENTO", "CONFIRMADO", "EM_PREPARO", "PRONTO", "EM_ENTREGA"];
  for (const spec of openPipeline) {
    const createdAt = addMinutes(now, -spec.minsAgo - 3);
    const reachIndex = fullFlow.indexOf(spec.status);
    const path: OrderStatus[] =
      spec.status === "AGUARDANDO_PAGAMENTO" ? ["NOVO", "AGUARDANDO_PAGAMENTO"] : fullFlow.slice(0, reachIndex + 1);
    let t = createdAt;
    const history = path.map((status, i) => {
      if (i > 0) t = addMinutes(t, randInt(1, 4));
      return { status, at: t };
    });

    await placeOrder({
      createdAt,
      history,
      channel: pickChannel(),
      paymentMethod: pick<PaymentMethod>(["PIX", "CARTAO", "DINHEIRO"]),
      paymentStatus: spec.paymentStatus,
      notes: spec.notes,
    });
  }

  // ---------- a few manual expenses, for the future Financeiro module ----------
  await db.financialEntry.createMany({
    data: [
      { restaurantId: restaurant.id, type: "DESPESA", category: "Aluguel", amount: 4200, description: "Aluguel do salão", date: new Date(now.getFullYear(), now.getMonth(), 5) },
      { restaurantId: restaurant.id, type: "DESPESA", category: "Insumos", amount: 3180.5, description: "Compra de insumos da semana", date: addMinutes(now, -60 * 24 * 3) },
      { restaurantId: restaurant.id, type: "DESPESA", category: "Energia", amount: 612.4, description: "Conta de energia", date: new Date(now.getFullYear(), now.getMonth(), 10) },
    ],
  });

  console.log(`Seed concluído para o restaurante "${restaurant.name}".`);
  console.log("Login: carla@casabonfim.com.br / senha123");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
