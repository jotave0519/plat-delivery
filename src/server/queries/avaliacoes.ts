import "server-only";

import { db } from "@/lib/db";

/** Just enough to render the "Pedir avaliação" button's state on /pedidos/[id] — the full history/queue view is a later, separate screen. */
export function getReviewRequestLogForOrder(orderId: string) {
  return db.reviewRequestLog.findUnique({ where: { orderId }, select: { sentAt: true } });
}
