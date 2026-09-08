import "server-only";

import { db } from "@/lib/db";
import { oferecerProximoTecnico } from "@/server/actions/despacho-dispatch";

/**
 * Agente 3's poller — same durable, in-process shape as
 * src/server/feedback/scheduler.ts and src/server/reviews/scheduler.ts,
 * registered the same way from src/instrumentation.ts. Picks up chamados
 * whose offer to a specific técnico expired unanswered and re-offers to the
 * next one (or escalates, inside oferecerProximoTecnico itself, if nobody
 * is left to try).
 */
export async function processStalledChamados(): Promise<void> {
  const stalled = await db.chamado.findMany({
    where: { status: "OFERTADO", ofertaExpiraEm: { lte: new Date() } },
    select: { id: true },
    take: 50,
  });

  for (const { id } of stalled) {
    try {
      // Atomic claim: guards against the exact same race as a técnico
      // accepting/declining right as the timeout fires (handleTecnicoReply
      // makes the same conditional update) — whichever wins proceeds, the
      // loser is a silent no-op instead of double-offering the same chamado.
      const claim = await db.chamado.updateMany({ where: { id, status: "OFERTADO" }, data: { status: "RECEBIDO", tecnicoId: null, ofertaExpiraEm: null } });
      if (claim.count === 1) await oferecerProximoTecnico(id);
    } catch (err) {
      console.error(`Falha ao reprocessar chamado parado ${id}:`, err);
    }
  }
}
