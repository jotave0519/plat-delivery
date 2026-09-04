/**
 * Shared policy for how long a WhatsApp conversation stays handed off to a
 * human before the ordering agent is allowed to resume on its own.
 *
 * This is deliberately NOT a blanket "always reactivate after N hours" rule
 * disconnected from the conversation — it only ever applies to a conversation
 * that is already `aiEnabled: false`, and it measures real inactivity (no
 * message from either side, human or customer) since `lastMessageAt`. An
 * actively-ongoing human exchange keeps resetting that clock on every new
 * message, so it never crosses the window while genuinely in progress. Staff
 * can still end a handoff immediately at any time via the "Devolver conversa
 * para a IA" toggle (src/components/atendimento/conversation-ai-toggle.tsx)
 * — this window is only the safety net for when nobody does that manually.
 */
export const HUMAN_HANDOFF_IDLE_HOURS = 2;
export const HUMAN_HANDOFF_IDLE_MS = HUMAN_HANDOFF_IDLE_HOURS * 60 * 60 * 1000;

export type HandoffState = "IA" | "HUMANO_ATIVO" | "HUMANO_EXPIRADO";

/** Used both to decide whether to auto-resume and to label the conversation in the Atendimento IA screens. */
export function computeHandoffState(aiEnabled: boolean, lastMessageAt: Date): HandoffState {
  if (aiEnabled) return "IA";
  const idleMs = Date.now() - lastMessageAt.getTime();
  return idleMs >= HUMAN_HANDOFF_IDLE_MS ? "HUMANO_EXPIRADO" : "HUMANO_ATIVO";
}
