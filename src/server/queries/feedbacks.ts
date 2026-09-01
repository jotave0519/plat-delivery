import "server-only";

import { db } from "@/lib/db";
import type { FeedbackStatus } from "@/generated/prisma";

export type FeedbackListItem = {
  id: string;
  customerName: string | null;
  phoneNumber: string;
  orderNumber: number;
  status: FeedbackStatus;
  dueAt: Date;
  requestSentAt: Date | null;
  responseText: string | null;
  responseReceivedAt: Date | null;
  rating: number | null;
  isNew: boolean;
  resolvedAt: Date | null;
};

export async function listFeedbacks(restaurantId: string): Promise<FeedbackListItem[]> {
  const feedbacks = await db.feedback.findMany({
    where: { restaurantId },
    orderBy: [{ responseReceivedAt: "desc" }, { requestSentAt: "desc" }, { dueAt: "desc" }],
    include: { customer: { select: { name: true } }, order: { select: { number: true } } },
  });

  return feedbacks.map((f) => ({
    id: f.id,
    customerName: f.customer?.name ?? null,
    phoneNumber: f.phoneNumber,
    orderNumber: f.order.number,
    status: f.status,
    dueAt: f.dueAt,
    requestSentAt: f.requestSentAt,
    responseText: f.responseText,
    responseReceivedAt: f.responseReceivedAt,
    rating: f.rating,
    isNew: f.status === "RESPONDED" && !f.viewedAt,
    resolvedAt: f.resolvedAt,
  }));
}

export async function countNewFeedbacks(restaurantId: string): Promise<number> {
  return db.feedback.count({ where: { restaurantId, status: "RESPONDED", viewedAt: null } });
}
