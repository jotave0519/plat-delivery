import "server-only";

import { db } from "@/lib/db";
import { sendTextMessage } from "@/server/integrations/evolution/client";

/**
 * Every automated outbound WhatsApp text (agent replies, order-status
 * notifications, feedback requests/thank-yous) MUST go through this instead
 * of calling sendTextMessage directly — it's what lets the webhook tell "this
 * is an echo of a message we just sent ourselves" apart from "a human just
 * typed a reply on the connected number", by recording the real message id
 * Evolution API returns. Skipping this for any automated send would make
 * that specific message misread as a human takeover the moment it echoes
 * back through MESSAGES_UPSERT (fromMe: true) — see
 * src/server/actions/atendimento-ia-conversa.ts's recordStaffReply.
 *
 * Always records the message in the conversation transcript (creating the
 * Conversation if it doesn't exist yet) even when the send itself fails,
 * matching the existing "never lose the message from history" behavior.
 */
export async function sendAndRecordOutboundMessage(params: {
  restaurantId: string;
  phoneNumber: string;
  instanceName: string;
  text: string;
  customerId?: string;
}): Promise<void> {
  const { restaurantId, phoneNumber, instanceName, text, customerId } = params;

  let whatsappMessageId: string | undefined;
  try {
    const result = await sendTextMessage(instanceName, phoneNumber, text);
    whatsappMessageId = result.key?.id;
  } catch (err) {
    console.error("Falha ao enviar mensagem via Evolution API:", err);
  }

  const conversation = await db.conversation.upsert({
    where: { restaurantId_phoneNumber: { restaurantId, phoneNumber } },
    update: {},
    create: { restaurantId, phoneNumber, customerId },
  });

  await db.message.create({
    data: { conversationId: conversation.id, direction: "OUT", content: text, whatsappMessageId },
  });
}
