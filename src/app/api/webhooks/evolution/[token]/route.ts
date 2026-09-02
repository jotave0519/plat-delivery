import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { processConversationMessage } from "@/server/actions/atendimento-ia-conversa";
import type { Prisma } from "@/generated/prisma";

/**
 * Single inbound webhook for the Evolution API (message received/sent,
 * connection updates, instance events, etc). Evolution API doesn't sign
 * webhook requests by default, so the shared secret lives in the URL path
 * itself — configure the instance's webhook URL as
 * `https://<host>/api/webhooks/evolution/<EVOLUTION_WEBHOOK_SECRET>`.
 *
 * It resolves which restaurant the event belongs to (via instanceName →
 * WhatsappConnection), logs the raw payload for every event type (audit
 * trail), keeps WhatsappConnection's live status in sync for QRCODE_UPDATED/
 * CONNECTION_UPDATE, and hands MESSAGES_UPSERT off to the conversational
 * agent (processConversationMessage). The exact MESSAGES_UPSERT payload
 * shape is unconfirmed against the real Evolution API — extraction below
 * tries several known Baileys/Evolution field paths defensively; every raw
 * payload is logged regardless, so a real test message's shape can be read
 * straight from WhatsappWebhookEvent and the extraction adjusted if needed.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/webhooks/evolution/[token]">) {
  const { token } = await ctx.params;

  if (!env.EVOLUTION_WEBHOOK_SECRET || token !== env.EVOLUTION_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const instanceName = extractString(payload, "instance");
  // Evolution API sends `event` as lowercase dot-notation (e.g.
  // "messages.upsert", "connection.update") — normalize dots to underscores
  // so it matches the SCREAMING_SNAKE_CASE names used for comparison below
  // (and for the `events` list passed to POST /webhook/set).
  const eventType = (extractString(payload, "event") ?? "unknown").toUpperCase().replace(/\./g, "_");

  const connection = instanceName
    ? await db.whatsappConnection.findUnique({ where: { instanceName }, select: { restaurantId: true } })
    : null;

  await db.whatsappWebhookEvent.create({
    data: {
      restaurantId: connection?.restaurantId ?? null,
      instanceName: instanceName ?? null,
      eventType,
      payload: payload as Prisma.InputJsonValue,
    },
  });

  if (instanceName && connection) {
    if (eventType === "QRCODE_UPDATED") {
      const qrCode = extractString(payload, "qrcode") ?? extractNested(payload, ["qrcode", "base64"]);
      await db.whatsappConnection.update({
        where: { instanceName },
        data: { status: "CONNECTING", qrCode, lastEventAt: new Date() },
      });
    } else if (eventType === "CONNECTION_UPDATE") {
      const state = extractString(payload, "state") ?? extractNested(payload, ["data", "state"]);
      const status = state === "open" ? "CONNECTED" : state === "connecting" ? "CONNECTING" : "DISCONNECTED";
      const phoneNumber = extractNested(payload, ["data", "wuid"])?.split("@")[0] ?? undefined;
      await db.whatsappConnection.update({
        where: { instanceName },
        data: {
          status,
          lastEventAt: new Date(),
          ...(status === "CONNECTED" ? { qrCode: null } : {}),
          ...(phoneNumber ? { phoneNumber } : {}),
        },
      });
    } else if (eventType === "MESSAGES_UPSERT") {
      const inbound = extractInboundMessage(payload);
      // Skip our own sent messages (echoed back by Evolution API) and
      // anything we couldn't confidently parse — never guess a phone number.
      if (inbound && !inbound.fromMe && inbound.phoneNumber && (inbound.text || inbound.image)) {
        try {
          await processConversationMessage({
            restaurantId: connection.restaurantId,
            phoneNumber: inbound.phoneNumber,
            pushName: inbound.pushName,
            text: inbound.text,
            image: inbound.image,
            whatsappMessageId: inbound.messageId,
            instanceName,
          });
        } catch (err) {
          console.error("Falha ao processar mensagem recebida do WhatsApp:", err);
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}

type InboundMessage = {
  phoneNumber: string | null;
  fromMe: boolean;
  messageId: string | null;
  pushName: string | null;
  text: string | null;
  /** Present when the message is an image (e.g. a Pix payment proof) — the raw {key, message} needed to fetch/decode it via fetchMediaBase64. */
  image: { rawMessage: unknown; mimetype: string | null; caption: string | null } | null;
};

/**
 * Defensive extraction for a MESSAGES_UPSERT event — the exact payload shape
 * hasn't been confirmed against a real Evolution API instance yet. Tries the
 * known Baileys/Evolution field paths; returns null if nothing recognizable
 * is found (rather than guessing).
 */
function extractInboundMessage(payload: unknown): InboundMessage | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const rawData = root.data;
  // Some Evolution API configurations wrap the message(s) in `data.messages`
  // (array); most send a single message object directly in `data`.
  const data =
    rawData && typeof rawData === "object" && Array.isArray((rawData as Record<string, unknown>).messages)
      ? ((rawData as Record<string, unknown>).messages as unknown[])[0]
      : rawData;
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;

  const key = (d.key && typeof d.key === "object" ? d.key : {}) as Record<string, unknown>;
  const remoteJid = typeof key.remoteJid === "string" ? key.remoteJid : null;
  const fromMe = key.fromMe === true;
  const messageId = typeof key.id === "string" ? key.id : null;
  const pushName = typeof d.pushName === "string" ? d.pushName : null;

  const message = (d.message && typeof d.message === "object" ? d.message : {}) as Record<string, unknown>;
  const extendedText = (message.extendedTextMessage && typeof message.extendedTextMessage === "object"
    ? message.extendedTextMessage
    : {}) as Record<string, unknown>;
  const text =
    (typeof message.conversation === "string" ? message.conversation : null) ??
    (typeof extendedText.text === "string" ? extendedText.text : null);

  const imageMessage = (message.imageMessage && typeof message.imageMessage === "object"
    ? message.imageMessage
    : null) as Record<string, unknown> | null;
  const image = imageMessage
    ? {
        rawMessage: { key: d.key, message: d.message },
        mimetype: typeof imageMessage.mimetype === "string" ? imageMessage.mimetype : null,
        caption: typeof imageMessage.caption === "string" ? imageMessage.caption : null,
      }
    : null;

  const phoneNumber = remoteJid ? remoteJid.split("@")[0] : null;

  return { phoneNumber, fromMe, messageId, pushName, text, image };
}

function extractString(payload: unknown, key: string): string | null {
  if (payload && typeof payload === "object" && key in payload) {
    const value = (payload as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
  }
  return null;
}

/** Reads a nested string field (e.g. payload.data.state) without assuming the whole chain exists. */
function extractNested(payload: unknown, path: string[]): string | null {
  let current: unknown = payload;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : null;
}
