import "server-only";

import { sendAndRecordOutboundMessage } from "@/server/integrations/evolution/outbound-message";
import type { PricingLine } from "@/server/orcamento/pricing";

/**
 * Agente 4's system-side dispatch logic (formatting/sending the quote
 * message and the follow-up reminder) — never imported by a client
 * component, kept in its own server-only file for the exact reason
 * src/server/actions/despacho-dispatch.ts is separate from despacho.ts:
 * mixing this into a "use server" file would bundle the whole db/pg
 * dependency chain into the client build the moment any exported function
 * here got imported by a "use client" component (the bug found and fixed
 * during Agente 3's verification).
 */

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** No PDF this round (deferred, per the confirmed decision) — a clear, itemized WhatsApp text message. */
export function formatOrcamentoMessage(params: {
  restaurantName: string;
  detalhamento: PricingLine[];
  total: number;
  validoAte: Date;
}): string {
  const { restaurantName, detalhamento, total, validoAte } = params;
  const linhas = detalhamento.map((d) => `  • ${d.nome}: ${formatCurrency(d.valor)}`).join("\n");
  const validade = validoAte.toLocaleDateString("pt-BR");
  return `Orçamento — ${restaurantName}\n\n${linhas}\n\nTotal: ${formatCurrency(total)}\n\nValidade: até ${validade}.\n\nSe estiver de acordo, é só responder confirmando! 😊`;
}

export async function enviarOrcamentoWhatsapp(params: {
  restaurantId: string;
  phoneNumber: string;
  instanceName: string;
  customerId?: string;
  text: string;
}): Promise<void> {
  await sendAndRecordOutboundMessage(params);
}

export function formatFollowUpMessage(): string {
  return "Oi! Só passando pra saber se você viu o orçamento que te enviamos — ainda está dentro do prazo. Qualquer dúvida, me chama! 😊";
}
