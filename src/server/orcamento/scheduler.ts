import "server-only";

import { db } from "@/lib/db";
import { enviarOrcamentoWhatsapp, formatFollowUpMessage } from "@/server/actions/orcamento-dispatch";
import { resolveConnectedInstance } from "@/server/integrations/evolution/connection";

/**
 * Agente 4's poller — same durable, in-process shape as
 * src/server/feedback/scheduler.ts / src/server/reviews/scheduler.ts /
 * src/server/despacho/scheduler.ts, registered the same way from
 * src/instrumentation.ts.
 */

// ---------- job 1: send due follow-ups, exactly once per quote ----------

export async function processQuoteFollowUps(): Promise<void> {
  const due = await db.quoteFollowUp.findMany({
    where: { enviado: false, enviarEm: { lte: new Date() } },
    include: { quote: { include: { customer: true } } },
    take: 50,
  });

  for (const followUp of due) {
    try {
      if (followUp.quote.status !== "ENVIADO") {
        // Already accepted/declined/expired — a follow-up reminder no
        // longer makes sense. Marked sent so it's never retried.
        await db.quoteFollowUp.update({ where: { id: followUp.id }, data: { enviado: true } });
        continue;
      }
      const phone = followUp.quote.customer?.phone;
      if (!phone) {
        await db.quoteFollowUp.update({ where: { id: followUp.id }, data: { enviado: true } });
        continue;
      }

      const instanceName = await resolveConnectedInstance(followUp.quote.restaurantId);
      if (!instanceName) continue; // not connected right now — retried on the next poll

      // Atomic claim: guards the exact same race the other 4 pollers in this
      // project already guard (a second poller tick firing before this one
      // finishes) — whichever wins the conditional update proceeds.
      const claim = await db.quoteFollowUp.updateMany({ where: { id: followUp.id, enviado: false }, data: { enviado: true } });
      if (claim.count === 0) continue;

      await enviarOrcamentoWhatsapp({
        restaurantId: followUp.quote.restaurantId,
        phoneNumber: phone,
        instanceName,
        customerId: followUp.quote.customerId ?? undefined,
        text: formatFollowUpMessage(),
      });
    } catch (err) {
      console.error(`Falha ao processar follow-up de orçamento (QuoteFollowUp ${followUp.id}):`, err);
    }
  }
}

// ---------- job 2: expire quotes past their validity ----------

export async function processExpiredQuotes(): Promise<void> {
  await db.quote.updateMany({
    where: { status: "ENVIADO", validoAte: { lte: new Date() } },
    data: { status: "EXPIRADO" },
  });
}
