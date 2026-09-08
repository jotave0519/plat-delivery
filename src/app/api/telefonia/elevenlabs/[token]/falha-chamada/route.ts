import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { registrarLigacaoPerdida } from "@/server/actions/recuperacao-ligacao";

/**
 * ElevenLabs' call_initiation_failure webhook — fired when a call never
 * connects (no-answer, busy, etc.), distinct from the post-call
 * transcription webhook. Payload shape is a best-effort guess (not yet
 * confirmed against a real account) — same discipline as the other 3
 * telefonia routes. Where exactly this webhook type is registered on the
 * ElevenLabs side (workspace/number setting, not something
 * createOrUpdateAgent controls) is a real pending item, documented here,
 * not simulated as if already confirmed.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/telefonia/elevenlabs/[token]/falha-chamada">) {
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
  const callerId = typeof p.caller_id === "string" ? p.caller_id : null;
  const calledNumber = typeof p.called_number === "string" ? p.called_number : null;
  const failureReason = typeof p.failure_reason === "string" ? p.failure_reason : undefined;

  if (!callerId || !calledNumber) {
    return NextResponse.json({ error: "missing required fields (caller_id/called_number)" }, { status: 400 });
  }

  const restaurant = await db.restaurant.findFirst({
    where: { phoneAgentTwilioNumber: calledNumber },
    select: { id: true },
  });
  if (!restaurant) return NextResponse.json({ received: true }); // unrecognized number — nothing to recover

  await registrarLigacaoPerdida({ restaurantId: restaurant.id, callerPhone: callerId, motivo: failureReason });

  return NextResponse.json({ received: true });
}
