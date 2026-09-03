import { getTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { subscribeToNewOrders, type NewOrderEvent } from "@/server/realtime/order-events";

/**
 * Server-Sent Events stream of "new order created" for the caller's own
 * restaurant. Requires a real session (this is a normal browser request,
 * unlike the Evolution API webhook) — getTenant() resolves restaurantId
 * from it, so one restaurant can never subscribe to another's events.
 *
 * Never cached/statically optimized — this is a long-lived stream.
 */
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

function sseLine(event: NewOrderEvent): string {
  // `id:` is what makes EventSource resend it as Last-Event-ID on reconnect
  // — createdAt is monotonic enough per restaurant for this purpose (an
  // exact-millisecond tie between two orders is vanishingly unlikely and,
  // even if it happened, would only cost one harmless duplicate replay).
  return `id: ${event.createdAt}\nevent: new-order\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function GET(request: Request) {
  let tenant: Awaited<ReturnType<typeof getTenant>>;
  try {
    tenant = await getTenant();
  } catch {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Catch-up: the browser resends the last event id it saw as
      // Last-Event-ID on reconnect — replay anything created since then
      // from the database (the source of truth), so a dropped connection
      // never silently loses an order. No separate "pending notification"
      // table needed for this.
      const lastEventId = request.headers.get("last-event-id");
      if (lastEventId) {
        const cursor = new Date(lastEventId);
        if (!Number.isNaN(cursor.getTime())) {
          const missed = await db.order.findMany({
            where: { restaurantId: tenant.restaurantId, createdAt: { gt: cursor } },
            orderBy: { createdAt: "asc" },
            select: { id: true, number: true, createdAt: true },
          });
          for (const order of missed) {
            controller.enqueue(encoder.encode(sseLine({ id: order.id, number: order.number, createdAt: order.createdAt.toISOString() })));
          }
        }
      }

      unsubscribe = subscribeToNewOrders(tenant.restaurantId, (event) => {
        controller.enqueue(encoder.encode(sseLine(event)));
      });

      // Keeps the connection alive through proxies/load balancers that
      // would otherwise time out an idle stream (standard SSE practice).
      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, HEARTBEAT_MS);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  request.signal.addEventListener("abort", () => {
    unsubscribe?.();
    if (heartbeat) clearInterval(heartbeat);
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
