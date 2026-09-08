import "server-only";

import { db } from "@/lib/db";
import { sendAndRecordOutboundMessage } from "@/server/integrations/evolution/outbound-message";
import { resolveConnectedInstance } from "@/server/integrations/evolution/connection";
import { normalizeText } from "@/lib/text-similarity";
import type { ChamadoStatus } from "@/generated/prisma";

/**
 * Agente 3's system-side dispatch logic — dispatch/escalation/notifications/
 * technician-reply handling. Never imported by a client component (unlike
 * src/server/actions/despacho.ts, a "use server" file with the manual/
 * settings actions) — kept in its own server-only file for the same reason
 * src/server/actions/whatsapp-order-notifications.ts is separate from
 * orders.ts: mixing this into a "use server" file would bundle the whole
 * db/pg dependency chain into the client build the moment any exported
 * function here got imported by a "use client" component.
 *
 * None of buscar_tecnico_disponivel/despachar_chamado/atualizar_status_chamado/
 * notificar_cliente/escalar_para_humano from the original spec are exposed
 * to the LLM as tools — they're all triggered by real system events (a call
 * confirmed, a technician's WhatsApp reply, a timeout), never by the
 * customer's conversation deciding to call them. Same simplification
 * already applied to Agente 2's registrar_ligacao_perdida.
 */

// ---------- dispatch ----------

/**
 * Finds the first available technician not yet offered this chamado,
 * preferring one matching both specialty and region, falling back to
 * specialty-only, and escalates to a human immediately if nobody is left to
 * try — never leaves a chamado waiting on a timeout that can't resolve.
 * Called synchronously right after confirmar_chamado (an emergency can't
 * wait for the poller's 5-minute interval) and again by
 * processStalledChamados whenever an offer expires unanswered.
 */
export async function oferecerProximoTecnico(chamadoId: string): Promise<{ ok: boolean }> {
  const chamado = await db.chamado.findUniqueOrThrow({ where: { id: chamadoId } });
  if (chamado.status !== "RECEBIDO" && chamado.status !== "OFERTADO") return { ok: false }; // already resolved otherwise — nothing to do

  // A técnico already handling a different chamado (OFERTADO/A_CAMINHO/
  // EM_ATENDIMENTO on it) is never offered a second one — a técnico can only
  // ever have one non-terminal chamado at a time. Without this, two active
  // chamados could end up assigned to the same técnico simultaneously, and
  // handleTecnicoReply's lookup-by-(tecnicoId, status) below would have no
  // way to tell which chamado a "cheguei"/"concluído" reply refers to (a
  // real bug found during verification, not a hypothetical one).
  const tecnicosOcupados = await db.chamado.findMany({
    where: { restaurantId: chamado.restaurantId, status: { in: ["OFERTADO", "A_CAMINHO", "EM_ATENDIMENTO"] }, tecnicoId: { not: null }, id: { not: chamadoId } },
    select: { tecnicoId: true },
  });
  const excluidos = [...chamado.tecnicosOfertados, ...tecnicosOcupados.map((c) => c.tecnicoId!)];

  const especialidadeGuess = normalizeText(chamado.problema);
  const baseWhere = { restaurantId: chamado.restaurantId, disponivel: true, id: { notIn: excluidos } };

  // Best-effort specialty match: a técnico's especialidades array is free
  // text (ex.: "elétrica"), matched against the problem description —
  // simple substring containment (accent/case-insensitive via the same
  // normalizeText already used for menu-import duplicate detection), no
  // NLP. Falls back to any available técnico not yet tried if nothing
  // matches (documented limitation, same spirit as the spec's own "regiões
  // configuradas manualmente" MVP note).
  const candidatos = await db.tecnicoDisponibilidade.findMany({ where: baseWhere });
  const porEspecialidade = candidatos.filter((t) => t.especialidades.some((e) => especialidadeGuess.includes(normalizeText(e))));
  const candidato = porEspecialidade[0] ?? candidatos[0];

  if (!candidato) {
    await escalarParaHumano(chamadoId, "Nenhum técnico disponível para este chamado.");
    return { ok: false };
  }

  const restaurant = await db.restaurant.findUniqueOrThrow({
    where: { id: chamado.restaurantId },
    select: { name: true, despachoOfertaTimeoutMinutos: true },
  });

  await db.chamado.update({
    where: { id: chamadoId },
    data: {
      tecnicoId: candidato.id,
      status: "OFERTADO",
      ofertaExpiraEm: new Date(Date.now() + restaurant.despachoOfertaTimeoutMinutos * 60 * 1000),
      tecnicosOfertados: { push: candidato.id },
    },
  });
  // Every status transition gets a ChamadoEvent — same completeness OrderEvent
  // already guarantees for Order. Found missing here during verification
  // (the history skipped straight from RECEBIDO to A_CAMINHO, silently
  // dropping every OFERTADO attempt, including re-offers after a decline).
  await db.chamadoEvent.create({ data: { chamadoId, status: "OFERTADO" } });

  const instanceName = await resolveConnectedInstance(chamado.restaurantId);
  if (instanceName) {
    const urgenciaLabel = chamado.urgencia === "EMERGENCIA" ? "🚨 EMERGÊNCIA" : chamado.urgencia === "URGENTE" ? "⚠️ Urgente" : "Normal";
    const text = `Novo chamado (${urgenciaLabel}) — ${restaurant.name}\n\nProblema: ${chamado.problema}\nEndereço: ${chamado.endereco}\n\nVocê consegue atender? Responda "aceito" ou "recuso".`;
    await sendAndRecordOutboundMessage({ restaurantId: chamado.restaurantId, phoneNumber: candidato.telefone, instanceName, text });
  }

  return { ok: true };
}

/**
 * "Ninguém aceitou"/"nenhum técnico disponível" — sends an alert to
 * despachoEscalationPhone. Never publishes/decides anything on its own; a
 * human resolves it manually via the queue UI (atribuirTecnicoManualmente/
 * atualizarStatusChamadoManualmente) — this only makes sure someone knows.
 */
export async function escalarParaHumano(chamadoId: string, motivo: string): Promise<void> {
  const chamado = await db.chamado.findUnique({ where: { id: chamadoId } });
  if (!chamado) return;

  const restaurant = await db.restaurant.findUnique({
    where: { id: chamado.restaurantId },
    select: { despachoEscalationPhone: true },
  });
  if (!restaurant?.despachoEscalationPhone) return; // nothing configured — documented gap, not simulated as handled

  const instanceName = await resolveConnectedInstance(chamado.restaurantId);
  if (!instanceName) return;

  const text = `⚠️ Chamado precisa de atenção manual\n\nProblema: ${chamado.problema}\nEndereço: ${chamado.endereco}\nMotivo: ${motivo}\n\nAtribua um técnico manualmente pela fila de chamados.`;
  await sendAndRecordOutboundMessage({ restaurantId: chamado.restaurantId, phoneNumber: restaurant.despachoEscalationPhone, instanceName, text });
}

// ---------- customer notifications ----------

const STATUS_MESSAGES: Partial<Record<ChamadoStatus, (problema: string) => string>> = {
  RECEBIDO: () => `Recebemos seu chamado! Já estamos buscando um técnico disponível. 🔧`,
  A_CAMINHO: () => `Um técnico aceitou seu chamado e está a caminho! 🚗`,
  EM_ATENDIMENTO: () => `O técnico chegou e já está atendendo seu chamado.`,
  CONCLUIDO: () => `Seu chamado foi concluído. Obrigado pela confiança! ✅`,
  CANCELADO: () => `Seu chamado foi cancelado.`,
};

/** Never fired for OFERTADO — internal churn between technicians, not something the customer needs to see. */
export async function notifyChamadoStatusChange(chamadoId: string): Promise<void> {
  try {
    const chamado = await db.chamado.findUnique({
      where: { id: chamadoId },
      select: { status: true, problema: true, restaurantId: true, customer: { select: { id: true, phone: true } } },
    });
    if (!chamado?.customer?.phone) return;

    const messageBuilder = STATUS_MESSAGES[chamado.status];
    if (!messageBuilder) return;

    const instanceName = await resolveConnectedInstance(chamado.restaurantId);
    if (!instanceName) return;

    await sendAndRecordOutboundMessage({
      restaurantId: chamado.restaurantId,
      phoneNumber: chamado.customer.phone,
      instanceName,
      text: messageBuilder(chamado.problema),
      customerId: chamado.customer.id,
    });
  } catch (err) {
    console.error("Falha ao notificar cliente sobre mudança de status do chamado:", err);
  }
}

// ---------- technician WhatsApp replies (deterministic keyword matching, never AI-decided) ----------

function matchesAny(text: string, keywords: string[]): boolean {
  const normalized = normalizeText(text);
  return keywords.some((k) => normalized.includes(normalizeText(k)));
}

// Listed without accents — normalizeText() strips them from both sides
// before comparing, so "não posso" in a real reply still matches "nao posso" here.
const ACEITE_KEYWORDS = ["aceito", "aceita", "sim", "ok", "beleza", "topo"];
const RECUSA_KEYWORDS = ["recuso", "nao posso", "nao consigo", "recusa", "nao"];
const CHEGADA_KEYWORDS = ["cheguei", "chegando", "iniciei", "iniciando"];
const CONCLUSAO_KEYWORDS = ["concluido", "concluí", "finalizado", "finalizei", "pronto", "terminei"];

/**
 * Routed from the webhook when the sender's phone matches a
 * TecnicoDisponibilidade for that restaurant — checked BEFORE the
 * customer-facing pipeline, since a technician's number is staff, never a
 * customer. Interprets the reply by keyword against whichever status the
 * chamado currently assigned to this técnico is in — deterministic, never
 * an AI decision (same principle as sentimentFromRating/extractRating).
 */
export async function handleTecnicoReply(params: {
  restaurantId: string;
  tecnicoId: string;
  text: string;
  instanceName: string;
}): Promise<void> {
  const { restaurantId, tecnicoId, text, instanceName } = params;

  const ofertado = await db.chamado.findFirst({ where: { restaurantId, tecnicoId, status: "OFERTADO" } });
  if (ofertado) {
    if (matchesAny(text, ACEITE_KEYWORDS)) {
      // Atomic claim: guards against the exact same race as the timeout
      // poller (processStalledChamados) — whichever wins the conditional
      // update proceeds, the other is a no-op.
      const claim = await db.chamado.updateMany({ where: { id: ofertado.id, status: "OFERTADO" }, data: { status: "A_CAMINHO", ofertaExpiraEm: null } });
      if (claim.count === 1) {
        await db.chamadoEvent.create({ data: { chamadoId: ofertado.id, status: "A_CAMINHO" } });
        await notifyChamadoStatusChange(ofertado.id);
      }
      return;
    }
    if (matchesAny(text, RECUSA_KEYWORDS)) {
      const claim = await db.chamado.updateMany({
        where: { id: ofertado.id, status: "OFERTADO" },
        data: { status: "RECEBIDO", tecnicoId: null, ofertaExpiraEm: null },
      });
      if (claim.count === 1) await oferecerProximoTecnico(ofertado.id);
      return;
    }
    // Neither keyword matched while a chamado is actively OFERTADO to this
    // técnico — fall through to the "nothing recognized" reply at the bottom
    // rather than silently doing nothing.
  }

  const aCaminho = await db.chamado.findFirst({ where: { restaurantId, tecnicoId, status: "A_CAMINHO" } });
  if (aCaminho && matchesAny(text, CHEGADA_KEYWORDS)) {
    await db.chamado.update({ where: { id: aCaminho.id }, data: { status: "EM_ATENDIMENTO" } });
    await db.chamadoEvent.create({ data: { chamadoId: aCaminho.id, status: "EM_ATENDIMENTO" } });
    await notifyChamadoStatusChange(aCaminho.id);
    return;
  }

  const emAtendimento = await db.chamado.findFirst({ where: { restaurantId, tecnicoId, status: "EM_ATENDIMENTO" } });
  if (emAtendimento && matchesAny(text, CONCLUSAO_KEYWORDS)) {
    const claim = await db.chamado.updateMany({ where: { id: emAtendimento.id, status: "EM_ATENDIMENTO" }, data: { status: "CONCLUIDO" } });
    if (claim.count === 1) {
      await db.chamadoEvent.create({ data: { chamadoId: emAtendimento.id, status: "CONCLUIDO" } });
      await notifyChamadoStatusChange(emAtendimento.id);
      await scheduleReviewRequestIfEnabled(emAtendimento.id);
    }
    return;
  }

  // Nothing recognized for this técnico's current situation — ask for one of
  // the expected keywords instead of silently doing nothing.
  const tecnico = await db.tecnicoDisponibilidade.findUnique({ where: { id: tecnicoId } });
  if (tecnico) {
    await sendAndRecordOutboundMessage({
      restaurantId,
      phoneNumber: tecnico.telefone,
      instanceName,
      text: 'Não entendi — responda "aceito"/"recuso" para uma oferta, "cheguei" ao chegar, ou "concluído" ao terminar.',
    });
  }
}

/**
 * Direct DB write, not src/server/actions/avaliacoes.ts's
 * agendarPedidoAvaliacao — that Server Action calls getTenant() (requires an
 * authenticated session), which doesn't exist in this webhook-driven code
 * path. Mirrors its logic (dueAt = now + 3h, orderId omitted since Chamado
 * isn't an Order) without the session dependency. Exported (not private)
 * because the manual "atualizarStatusChamadoManualmente" action also needs
 * it when a staff member advances a chamado to CONCLUIDO by hand.
 */
export async function scheduleReviewRequestIfEnabled(chamadoId: string): Promise<void> {
  const chamado = await db.chamado.findUnique({
    where: { id: chamadoId },
    select: { restaurantId: true, customer: { select: { phone: true } } },
  });
  if (!chamado?.customer?.phone) return;

  const restaurant = await db.restaurant.findUnique({ where: { id: chamado.restaurantId }, select: { reviewAgentEnabled: true } });
  if (!restaurant?.reviewAgentEnabled) return;

  await db.reviewRequestLog.create({
    data: { restaurantId: chamado.restaurantId, phoneNumber: chamado.customer.phone, dueAt: new Date(Date.now() + 3 * 60 * 60 * 1000) },
  });
}
