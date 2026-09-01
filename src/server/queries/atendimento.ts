import "server-only";

import { db } from "@/lib/db";

export function getWhatsappConnection(restaurantId: string) {
  return db.whatsappConnection.findUnique({ where: { restaurantId } });
}

export type ConversationListItem = {
  id: string;
  phoneNumber: string;
  contactName: string | null;
  customerName: string | null;
  aiEnabled: boolean;
  lastMessageAt: Date;
  lastMessagePreview: string | null;
};

/**
 * Read-only conversation list, sorted by most recent activity — deliberately
 * not a full CRM (per the brief: enough to keep an eye on things, not a
 * whole inbox product), but Message already stores the full transcript so a
 * richer view can be built later without any schema change.
 */
export async function listConversations(restaurantId: string, take = 30): Promise<ConversationListItem[]> {
  const conversations = await db.conversation.findMany({
    where: { restaurantId },
    orderBy: { lastMessageAt: "desc" },
    take,
    include: {
      customer: { select: { name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { content: true } },
    },
  });

  return conversations.map((c) => ({
    id: c.id,
    phoneNumber: c.phoneNumber,
    contactName: c.contactName,
    customerName: c.customer?.name ?? null,
    aiEnabled: c.aiEnabled,
    lastMessageAt: c.lastMessageAt,
    lastMessagePreview: c.messages[0]?.content ?? null,
  }));
}

export type ConversationDetail = {
  id: string;
  phoneNumber: string;
  contactName: string | null;
  customerName: string | null;
  aiEnabled: boolean;
  messages: { id: string; direction: "IN" | "OUT"; content: string; createdAt: Date }[];
};

export async function getConversation(restaurantId: string, conversationId: string): Promise<ConversationDetail | null> {
  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, restaurantId },
    include: {
      customer: { select: { name: true } },
      messages: { orderBy: { createdAt: "asc" }, select: { id: true, direction: true, content: true, createdAt: true } },
    },
  });
  if (!conversation) return null;

  return {
    id: conversation.id,
    phoneNumber: conversation.phoneNumber,
    contactName: conversation.contactName,
    customerName: conversation.customer?.name ?? null,
    aiEnabled: conversation.aiEnabled,
    messages: conversation.messages,
  };
}
