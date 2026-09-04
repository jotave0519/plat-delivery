import "server-only";

import { db } from "@/lib/db";

export type PhoneAgentSettings = {
  enabled: boolean;
  elevenLabsAgentId: string | null;
  twilioNumber: string | null;
  humanTransferNumber: string | null;
};

export async function getPhoneAgentSettings(restaurantId: string): Promise<PhoneAgentSettings> {
  const restaurant = await db.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    select: {
      phoneAgentEnabled: true,
      phoneAgentElevenLabsAgentId: true,
      phoneAgentTwilioNumber: true,
      phoneAgentHumanTransferNumber: true,
    },
  });
  return {
    enabled: restaurant.phoneAgentEnabled,
    elevenLabsAgentId: restaurant.phoneAgentElevenLabsAgentId,
    twilioNumber: restaurant.phoneAgentTwilioNumber,
    humanTransferNumber: restaurant.phoneAgentHumanTransferNumber,
  };
}

export type PhoneCallListItem = {
  id: string;
  callerPhone: string;
  customerName: string | null;
  status: "EM_ANDAMENTO" | "CONCLUIDA" | "TRANSFERIDA" | "FALHA";
  transferredToHuman: boolean;
  orderNumber: number | null;
  durationSeconds: number | null;
  startedAt: Date;
};

/** Read-only call history, sorted by most recent — same "enough to keep an eye on things" scope as listConversations for WhatsApp. */
export async function listPhoneCalls(restaurantId: string, take = 30): Promise<PhoneCallListItem[]> {
  const calls = await db.phoneCall.findMany({
    where: { restaurantId },
    orderBy: { startedAt: "desc" },
    take,
    include: {
      customer: { select: { name: true } },
      order: { select: { number: true } },
    },
  });

  return calls.map((c) => ({
    id: c.id,
    callerPhone: c.callerPhone,
    customerName: c.customer?.name ?? null,
    status: c.status,
    transferredToHuman: c.transferredToHuman,
    orderNumber: c.order?.number ?? null,
    durationSeconds: c.durationSeconds,
    startedAt: c.startedAt,
  }));
}
