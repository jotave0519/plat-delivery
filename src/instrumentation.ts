/**
 * Next.js's server-startup hook (runs once when the process boots, both in
 * dev and production — see docker-entrypoint.sh, which execs `next start`
 * as a single long-running process). Used here to start the in-process
 * poller for the post-order feedback feature (src/server/feedback/scheduler.ts)
 * — there's no separate worker/cron infrastructure in this project, and a
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
}
