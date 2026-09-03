import "server-only";

import { EventEmitter } from "node:events";

/**
 * In-process broadcast for "a new order was created" — used to push a
 * real-time update to any open browser tab via SSE
 * (src/app/api/realtime/orders/route.ts). Deliberately just a Node
 * EventEmitter, not Redis/pub-sub: this app deploys as a single always-on
 * `next start` process (see docker-entrypoint.sh — no replicas), so every
 * request lands in the same process and an in-memory emitter is sufficient.
 * If this app is ever horizontally scaled, this stops being enough and
 * needs a shared pub/sub (e.g. Redis) instead — not the case today.
 *
 * Scoped per restaurant via the event name itself (`order:${restaurantId}`)
 * — a listener for one restaurant can never receive another's event class,
 * which is what keeps this multi-tenant-safe alongside the session check in
 * the route handler.
 *
 * `globalThis`-backed so dev-mode hot-reload never creates a second emitter
 * with orphaned listeners — same pattern as src/lib/db.ts.
 */

export type NewOrderEvent = { id: string; number: number; createdAt: string };

const globalForOrderEvents = globalThis as unknown as { orderEventEmitter?: EventEmitter };

const emitter = globalForOrderEvents.orderEventEmitter ?? new EventEmitter();
emitter.setMaxListeners(0); // unlimited — one listener per open browser tab/device, no fixed cap makes sense here
globalForOrderEvents.orderEventEmitter = emitter;

function channelFor(restaurantId: string) {
  return `order:${restaurantId}`;
}

/** Called right after a new Order is created — the only two call sites are createManualOrder and confirmar_pedido's tool handler. */
export function publishNewOrder(restaurantId: string, order: { id: string; number: number; createdAt: Date }) {
  const payload: NewOrderEvent = { id: order.id, number: order.number, createdAt: order.createdAt.toISOString() };
  emitter.emit(channelFor(restaurantId), payload);
}

/** Subscribes to new-order events for one restaurant; returns an unsubscribe function. */
export function subscribeToNewOrders(restaurantId: string, listener: (event: NewOrderEvent) => void): () => void {
  const channel = channelFor(restaurantId);
  emitter.on(channel, listener);
  return () => emitter.off(channel, listener);
}
