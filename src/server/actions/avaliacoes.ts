"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import { sendAndRecordOutboundMessage } from "@/server/integrations/evolution/outbound-message";
import { replyToReview } from "@/server/integrations/google-business-profile/client";

/**
 * Manual trigger (per the spec: "gatilho manual no MVP") for a post-service
 * review request — schedules a durable ReviewRequestLog (dueAt in the
 * future), same "survives a restart/deploy" pattern as Feedback.dueAt. The
 * actual send happens later, from src/server/reviews/scheduler.ts's
 * processDueReviewRequests() — this action only records the intent.
 */
export async function agendarPedidoAvaliacao(params: { phoneNumber: string; orderId?: string; atrasoHoras?: number }) {
  const tenant = await getTenant();
  const { phoneNumber, orderId, atrasoHoras = 3 } = params;

  if (orderId) {
    const existing = await db.reviewRequestLog.findUnique({ where: { orderId } });
    if (existing) return { error: "Já foi agendado um pedido de avaliação para este pedido." };
  }

  await db.reviewRequestLog.create({
    data: {
      restaurantId: tenant.restaurantId,
      orderId,
      phoneNumber,
      dueAt: new Date(Date.now() + atrasoHoras * 60 * 60 * 1000),
    },
  });

  if (orderId) revalidatePath(`/pedidos/${orderId}`);
  return { ok: true };
}

/**
 * Captures the owner's WhatsApp reply to a pending negative-review draft —
 * called from processConversationMessage BEFORE the ordering agent runs
 * (same short-circuit shape as captureFeedbackReply/capturePixProofImage in
 * atendimento-ia-conversa.ts), so the ordering AI never tries to answer the
 * owner's approval/edit as if it were a customer inquiry. Returns false
 * (and changes nothing) whenever the message isn't from the configured
 * owner phone, or there's no review actually awaiting approval — the
 * caller then falls through to the normal flow.
 *
 * Simplifying assumption (same class already accepted for Pix-proof
 * capture): matches the MOST RECENT review awaiting this owner's approval.
 * If more than one negative review is pending for the same number at once,
 * this could misattribute the reply — acceptable for the MVP, revisit if
 * it becomes a real problem.
 */
export async function captureReviewApprovalReply(params: {
  restaurantId: string;
  phoneNumber: string;
  instanceName: string;
  text: string;
}): Promise<boolean> {
  const { restaurantId, phoneNumber, instanceName, text } = params;

  const restaurant = await db.restaurant.findUnique({
    where: { id: restaurantId },
    select: { reviewAgentOwnerPhone: true, reviewAgentGoogleLocationId: true },
  });
  const ownerPhoneDigits = restaurant?.reviewAgentOwnerPhone?.replace(/\D/g, "");
  if (!ownerPhoneDigits || ownerPhoneDigits !== phoneNumber.replace(/\D/g, "")) return false;

  const pending = await db.review.findFirst({
    where: { restaurantId, status: "AGUARDANDO_DONO" },
    orderBy: { createdAt: "desc" },
  });
  if (!pending) return false;

  const finalText = text.trim().toLowerCase() === "ok" ? pending.draftResponse : text.trim();
  if (!finalText) return false;

  try {
    if (restaurant?.reviewAgentGoogleLocationId) {
      await replyToReview(restaurant.reviewAgentGoogleLocationId, pending.googleReviewId, finalText);
    }
    await db.review.update({
      where: { id: pending.id },
      data: { status: "RESOLVIDA", publishedResponse: finalText, respondedAt: new Date() },
    });
    await sendAndRecordOutboundMessage({ restaurantId, phoneNumber, instanceName, text: "Resposta publicada! ✅" });
  } catch (err) {
    console.error("Falha ao publicar resposta de avaliação aprovada pelo dono:", err);
    await sendAndRecordOutboundMessage({
      restaurantId,
      phoneNumber,
      instanceName,
      text: "Tive um problema para publicar agora — vou tentar de novo em instantes.",
    });
  }

  return true;
}
