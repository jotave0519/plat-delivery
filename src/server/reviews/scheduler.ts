import "server-only";

import { db } from "@/lib/db";
import { listReviews, replyToReview, starRatingToNumber } from "@/server/integrations/google-business-profile/client";
import { gerarResposta } from "@/server/integrations/anthropic/review-writer";
import { sentimentFromRating } from "@/lib/review-sentiment";
import { sendAndRecordOutboundMessage } from "@/server/integrations/evolution/outbound-message";
import { resolveConnectedInstance } from "@/server/integrations/evolution/connection";

/**
 * The Agente 1 poller — same durable, in-process shape as
 * src/server/feedback/scheduler.ts, registered the same way from
 * src/instrumentation.ts. Two independent jobs share this file because
 * they're both "Agente 1" concerns (AGENTS.md: keep each agent's own
 * namespace), not because they're related to each other.
 */

// ---------- job 1: detect new reviews, respond or escalate ----------

export async function processReviewAgent(): Promise<void> {
  const restaurants = await db.restaurant.findMany({
    where: { reviewAgentEnabled: true, reviewAgentGoogleLocationId: { not: null } },
    select: { id: true, reviewAgentGoogleLocationId: true, reviewAgentTomDeVoz: true, reviewAgentOwnerPhone: true },
  });

  for (const restaurant of restaurants) {
    try {
      await processRestaurantReviews(restaurant as typeof restaurant & { reviewAgentGoogleLocationId: string });
    } catch (err) {
      console.error(`Falha ao processar avaliações do restaurante ${restaurant.id}:`, err);
    }
  }
}

async function processRestaurantReviews(restaurant: {
  id: string;
  reviewAgentGoogleLocationId: string;
  reviewAgentTomDeVoz: string | null;
  reviewAgentOwnerPhone: string | null;
}) {
  const locationId = restaurant.reviewAgentGoogleLocationId;
  const googleReviews = await listReviews(locationId);

  for (const googleReview of googleReviews) {
    const rating = starRatingToNumber(googleReview.starRating);
    const sentiment = sentimentFromRating(rating);

    // Idempotent by googleReviewId (same role as Message.whatsappMessageId):
    // upsert instead of a bare create, so a review that was recorded on a
    // previous poll but never finished processing (e.g. a transient publish
    // failure left it at PENDENTE) gets retried instead of being silently
    // skipped forever once it "exists".
    const review = await db.review.upsert({
      where: { googleReviewId: googleReview.reviewId },
      update: {},
      create: {
        restaurantId: restaurant.id,
        googleReviewId: googleReview.reviewId,
        authorName: googleReview.reviewer.displayName,
        rating,
        text: googleReview.comment ?? null,
        sentiment,
        status: "PENDENTE",
      },
    });
    if (review.status !== "PENDENTE") continue; // already fully handled on a previous poll

    const { draftResponse } = await gerarResposta({
      reviewText: googleReview.comment ?? null,
      rating,
      sentiment,
      tomDeVoz: restaurant.reviewAgentTomDeVoz,
    });

    if (sentiment === "NEGATIVA") {
      // Never published automatically — no exception, no flag to turn this off.
      await db.review.update({ where: { id: review.id }, data: { draftResponse, status: "AGUARDANDO_DONO" } });

      if (restaurant.reviewAgentOwnerPhone) {
        const instanceName = await resolveConnectedInstance(restaurant.id);
        if (instanceName) {
          const alertText = `⚠️ Avaliação negativa (${rating}★) de ${googleReview.reviewer.displayName}:\n"${googleReview.comment ?? "(sem comentário)"}"\n\nSugestão de resposta:\n${draftResponse}\n\nResponda "ok" para publicar essa sugestão, ou mande o texto que prefere usar no lugar.`;
          await sendAndRecordOutboundMessage({
            restaurantId: restaurant.id,
            phoneNumber: restaurant.reviewAgentOwnerPhone,
            instanceName,
            text: alertText,
          });
        }
        // Not connected right now — status stays AGUARDANDO_DONO and this
        // review is retried (re-alerted) on the next poll, same "leave it
        // for later" behavior as the feedback scheduler's own not-connected case.
      }
    } else {
      try {
        await replyToReview(locationId, googleReview.reviewId, draftResponse);
        await db.review.update({
          where: { id: review.id },
          data: { draftResponse, publishedResponse: draftResponse, status: "RESPONDIDA", respondedAt: new Date() },
        });
      } catch (err) {
        console.error(`Falha ao publicar resposta automática (Review ${review.id}):`, err);
        // Keep the draft and leave status at PENDENTE — retried on the next poll.
        await db.review.update({ where: { id: review.id }, data: { draftResponse } });
      }
    }
  }
}

// ---------- job 2: send due post-service review requests ----------

export async function processDueReviewRequests(): Promise<void> {
  const due = await db.reviewRequestLog.findMany({
    where: { sentAt: null, dueAt: { lte: new Date() } },
    take: 50,
  });

  for (const log of due) {
    try {
      const instanceName = await resolveConnectedInstance(log.restaurantId);
      if (!instanceName) continue; // not connected right now — retried on the next poll

      const restaurant = await db.restaurant.findUnique({
        where: { id: log.restaurantId },
        select: { reviewAgentReviewLink: true },
      });
      const linkLine = restaurant?.reviewAgentReviewLink
        ? `\n\n${restaurant.reviewAgentReviewLink}`
        : "";
      const text = `Oi! 😊 Passando pra pedir um favor: se puder, deixa sua avaliação sobre o atendimento no nosso Google — ajuda muito a gente!${linkLine}`;

      await sendAndRecordOutboundMessage({ restaurantId: log.restaurantId, phoneNumber: log.phoneNumber, instanceName, text });
      await db.reviewRequestLog.update({ where: { id: log.id }, data: { sentAt: new Date() } });
    } catch (err) {
      console.error(`Falha ao enviar pedido de avaliação (ReviewRequestLog ${log.id}):`, err);
    }
  }
}
