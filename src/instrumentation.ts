/**
 * Next.js's server-startup hook (runs once when the process boots, both in
 * dev and production — see docker-entrypoint.sh, which execs `next start`
 * as a single long-running process). Used here to start the in-process
 * pollers for features with no separate worker/cron infrastructure — a
 * single always-on Node process is exactly what this file assumes.
 *
 * Guarded by a globalThis flag (same pattern as src/lib/db.ts) so dev-mode
 * hot-reloads never register a second interval.
 */

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 30 * 1000;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const globalForScheduler = globalThis as unknown as { feedbackSchedulerStarted?: boolean };
  if (globalForScheduler.feedbackSchedulerStarted) return;
  globalForScheduler.feedbackSchedulerStarted = true;

  const { processDueFeedbacks } = await import("@/server/feedback/scheduler");
  const run = () => {
    processDueFeedbacks().catch((err) => console.error("Erro no poller de feedback:", err));
  };
  setTimeout(run, FIRST_RUN_DELAY_MS);
  setInterval(run, POLL_INTERVAL_MS);

  // Agente 1 (avaliações no Google) — same durable-poller shape, its own
  // registration so it can be reasoned about (and eventually disabled)
  // independently of the feedback poller.
  const { processReviewAgent, processDueReviewRequests } = await import("@/server/reviews/scheduler");
  const runReviewAgent = () => {
    processReviewAgent().catch((err) => console.error("Erro no poller de avaliações:", err));
  };
  const runReviewRequests = () => {
    processDueReviewRequests().catch((err) => console.error("Erro no poller de pedidos de avaliação:", err));
  };
  setTimeout(runReviewAgent, FIRST_RUN_DELAY_MS);
  setInterval(runReviewAgent, POLL_INTERVAL_MS);
  setTimeout(runReviewRequests, FIRST_RUN_DELAY_MS);
  setInterval(runReviewRequests, POLL_INTERVAL_MS);

  // Agente 3 (despacho de serviços residenciais) — re-offers a chamado
  // whose técnico didn't respond in time. Independent registration, same
  // reasoning as the review-agent pollers above.
  const { processStalledChamados } = await import("@/server/despacho/scheduler");
  const runStalledChamados = () => {
    processStalledChamados().catch((err) => console.error("Erro no poller de chamados parados:", err));
  };
  setTimeout(runStalledChamados, FIRST_RUN_DELAY_MS);
  setInterval(runStalledChamados, POLL_INTERVAL_MS);

  // Agente 4 (orçamento automático) — follow-up reminders + quote expiry.
  const { processQuoteFollowUps, processExpiredQuotes } = await import("@/server/orcamento/scheduler");
  const runQuoteFollowUps = () => {
    processQuoteFollowUps().catch((err) => console.error("Erro no poller de follow-up de orçamento:", err));
  };
  const runExpiredQuotes = () => {
    processExpiredQuotes().catch((err) => console.error("Erro no poller de expiração de orçamento:", err));
  };
  setTimeout(runQuoteFollowUps, FIRST_RUN_DELAY_MS);
  setInterval(runQuoteFollowUps, POLL_INTERVAL_MS);
  setTimeout(runExpiredQuotes, FIRST_RUN_DELAY_MS);
  setInterval(runExpiredQuotes, POLL_INTERVAL_MS);
}
