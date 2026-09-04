import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { finishPhoneCall } from "@/server/actions/telefonia-ia-chamada";

/**
 * ElevenLabs' post-call webhook — fired after the call ends. Records
 * duration/final status for the monitoring requirement (horário, duração,
 * status). Payload shape is a best-effort guess (not yet confirmed against
 * a real call) — a call whose conversation_id we don't recognize is a no-op
 * rather than an error, since post-call webhooks can fire for calls this
 * server never saw start (e.g. a misconfigured/orphaned agent).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/telefonia/elevenlabs/[token]/pos-chamada">) {
  const { token } = await ctx.params;
  if (!env.ELEVENLABS_WEBHOOK_SECRET || token !== env.ELEVENLABS_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const p = (payload ?? {}) as Record<string, unknown>;
  const conversationId = typeof p.conversation_id === "string" ? p.conversation_id : null;
  if (!conversationId) return NextResponse.json({ error: "missing conversation_id" }, { status: 400 });

  const call = await db.phoneCall.findUnique({ where: { elevenLabsConversationId: conversationId }, select: { id: true } });
  if (!call) return NextResponse.json({ received: true });

  const durationSeconds = typeof p.duration_seconds === "number" ? p.duration_seconds : undefined;
  await finishPhoneCall(call.id, { durationSeconds });

  return NextResponse.json({ received: true });
}
