import "server-only";

import { db } from "@/lib/db";
import { sendAndRecordOutboundMessage } from "@/server/integrations/evolution/outbound-message";
import { resolveConnectedInstance } from "@/server/integrations/evolution/connection";

/**
 * Fires immediately (not on a delayed poller like Feedback/ReviewRequestLog
 * — this one has a 30-second recovery target) whenever a call never
 * connects (ElevenLabs' call_initiation_failure webhook) or connects but
 * isn't resolved (post-call analysis.call_successful === false). Not tied
 * to a phone-agent domain — a missed pedido call is just as much a lost
 * contact as a missed generic-service one, so both webhook routes call
 * this the same way.
 */
export async function registrarLigacaoPerdida(params: { restaurantId: string; callerPhone: string; motivo?: string }) {
  const { restaurantId, callerPhone, motivo } = params;

  await db.callbackRequest.create({ data: { restaurantId, callerPhone, motivo } });

  try {
    const instanceName = await resolveConnectedInstance(restaurantId);
    if (!instanceName) return; // not connected right now — the CallbackRequest row still records the miss for follow-up

    const text = "Oi! Vimos que sua ligação não pôde ser concluída agora há pouco. Se quiser, me conta rapidinho o que você precisa que eu já te ajudo por aqui mesmo! 😊";
    await sendAndRecordOutboundMessage({ restaurantId, phoneNumber: callerPhone, instanceName, text });
  } catch (err) {
    console.error("Falha ao enviar recuperação de ligação perdida via WhatsApp:", err);
  }
}
