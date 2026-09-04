import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { startPhoneCall } from "@/server/actions/telefonia-ia-chamada";

/**
 * ElevenLabs' conversation-initiation webhook — called when a call reaches
 * the agent, before it says anything. We resolve which restaurant owns the
 * dialed number, build that call's real system prompt/first message (same
 * business logic as the WhatsApp agent, via buildAssistantContext), and
 * return them as an override — this is how the agent gets the real
 * cardápio/cliente instead of the generic prompt set at agent creation.
 *
 * Request/response shapes follow ElevenLabs' documented "Personalization"
 * and "Overrides" pages as of this writing, NOT yet confirmed against a
 * real call (no live ElevenLabs+Twilio number was available while building
 * this) — same discipline already used for the Evolution API webhook: keep
 * this extraction defensive, and adjust here (only here) once a real call
 * is placed.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/telefonia/elevenlabs/[token]/iniciar">) {
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
  const conversationId = typeof p.conversation_id === "string" ? p.conversation_id : null;

  if (!callerId || !calledNumber || !conversationId) {
    return NextResponse.json({ error: "missing required fields (caller_id/called_number/conversation_id)" }, { status: 400 });
  }

  const restaurant = await db.restaurant.findFirst({
    where: { phoneAgentTwilioNumber: calledNumber, phoneAgentEnabled: true },
    select: { id: true },
  });

  if (!restaurant) {
    // Número não reconhecido, ou recepcionista desativada nas Configurações
    // — resposta mínima e segura em vez de deixar a ligação sem resposta.
    return NextResponse.json({
      type: "conversation_initiation_client_data",
      conversation_config_override: {
        agent: { first_message: "No momento não estamos atendendo por aqui. Por favor, tente novamente mais tarde." },
      },
    });
  }

  const { callId, systemPrompt, firstMessage } = await startPhoneCall({
    restaurantId: restaurant.id,
    callerPhone: callerId,
    calledNumber,
    elevenLabsConversationId: conversationId,
  });

  return NextResponse.json({
    type: "conversation_initiation_client_data",
    // secret__ prefix keeps this out of the LLM's visible context — every
    // tool-webhook call during this same call must send it back in a
    // header (configured per-tool as e.g. "X-Call-Id: {{secret__call_id}}"
    // in the ElevenLabs agent's tool definitions) so we know which
    // PhoneCall row a given tool call belongs to.
    dynamic_variables: { secret__call_id: callId },
    conversation_config_override: {
      agent: {
        prompt: { prompt: systemPrompt },
        first_message: firstMessage,
      },
    },
  });
}
