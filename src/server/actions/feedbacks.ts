"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";

export async function markFeedbackViewed(feedbackId: string) {
  const tenant = await getTenant();

  const feedback = await db.feedback.findFirst({ where: { id: feedbackId, restaurantId: tenant.restaurantId } });
  if (!feedback) return { error: "Feedback não encontrado." };

  await db.feedback.update({ where: { id: feedbackId }, data: { viewedAt: new Date() } });
  revalidatePath("/feedbacks");
}

export async function markFeedbackResolved(feedbackId: string) {
  const tenant = await getTenant();

  const feedback = await db.feedback.findFirst({ where: { id: feedbackId, restaurantId: tenant.restaurantId } });
  if (!feedback) return { error: "Feedback não encontrado." };

  await db.feedback.update({
    where: { id: feedbackId },
    data: { resolvedAt: new Date(), viewedAt: feedback.viewedAt ?? new Date() },
  });
  revalidatePath("/feedbacks");
}
