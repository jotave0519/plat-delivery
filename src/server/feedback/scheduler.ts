import "server-only";

import { db } from "@/lib/db";
import { sendTextMessage } from "@/server/integrations/evolution/client";
import { resolveConnectedInstance } from "@/server/integrations/evolution/connection";

/**
 * Picks up every Feedback row whose dueAt has passed and sends the
 * follow-up message. Called on an interval by src/instrumentation.ts — this
 * function itself is stateless and safe to call repeatedly; each row is
 * "claimed" via a conditional updateMany before being acted on, so a
 * concurrent run (there isn't one today, but this is cheap insurance) can
 * never send the same feedback request twice.
 */
export async function processDueFeedbacks(): Promise<void> {
  const due = await db.feedback.findMany({
    where: { status: "PENDING", dueAt: { lte: new Date() } },
    include: { customer: { select: { name: true } }, order: { select: { number: true } } },
    take: 50,
  });

  for (const feedback of due) {
    const claim = await db.feedback.updateMany({
      where: { id: feedback.id, status: "PENDING" },
      data: { status: "SENDING" },
    });
    if (claim.count === 0) continue; // already claimed elsewhere

    try {
      const instanceName = await resolveConnectedInstance(feedback.restaurantId);
      if (!instanceName) {
        // Not connected right now — leave it for the next poll instead of
        // treating this as a permanent failure.
        await db.feedback.update({ where: { id: feedback.id }, data: { status: "PENDING" } });
        continue;
      }

      const firstName = feedback.customer?.name?.trim().split(/\s+/)[0];
      const greeting = firstName ? `Oi, ${firstName}!` : "Oi!";
      const text = `${greeting} 😊 Passando para saber: o que você achou do seu pedido #${feedback.order.number}? Se quiser, conta pra gente como foi — isso nos ajuda bastante!`;

      await sendTextMessage(instanceName, feedback.phoneNumber, text);

      const conversation = await db.conversation.upsert({
        where: { restaurantId_phoneNumber: { restaurantId: feedback.restaurantId, phoneNumber: feedback.phoneNumber } },
        update: {},
        create: {
          restaurantId: feedback.restaurantId,
          phoneNumber: feedback.phoneNumber,
          customerId: feedback.customerId,
        },
      });
      await db.message.create({ data: { conversationId: conversation.id, direction: "OUT", content: text } });

      await db.feedback.update({
        where: { id: feedback.id },
        data: { status: "SENT", requestSentAt: new Date() },
      });
    } catch (err) {
      console.error(`Falha ao enviar pedido de feedback (Feedback ${feedback.id}):`, err);
      await db.feedback.update({ where: { id: feedback.id }, data: { status: "FAILED" } });
    }
  }
}
