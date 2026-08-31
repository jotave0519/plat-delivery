import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
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
 * trail), and additionally keeps WhatsappConnection's live status in sync
 * for the two event types Fase 1 (conexão) cares about — QRCODE_UPDATED and
 * CONNECTION_UPDATE. Everything else (MESSAGES_UPSERT, etc.) is still just
 * logged; processing those is Fase 2 (persistência de conversas).
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
  const eventType = (extractString(payload, "event") ?? "unknown").toUpperCase();

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
    }
  }

  return NextResponse.json({ received: true });
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
