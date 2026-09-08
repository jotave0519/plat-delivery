import "server-only";

import { z } from "zod";

import { db } from "@/lib/db";
import { findExistingCustomerByPhone } from "@/lib/customer-lookup";
import type { Prisma } from "@/generated/prisma";

/**
 * Agente 2's generic-service counterpart to
 * src/server/actions/telefonia-ia-chamada.ts — same shape (startCall →
 * build prompt → run tools), a SIBLING file, not a branch inside that one,
 * per AGENTS.md ("cada agente novo no seu próprio namespace... nunca
 * misturado") and to guarantee the food-ordering flow already in
 * production is never touched by this work. Only genuinely
 * domain-agnostic pieces are reused directly: findExistingCustomerByPhone
 * (customer recognition), and handleTransferirParaHumano/finishPhoneCall
 * from telefonia-ia-chamada.ts (imported, not duplicated — see the
 * webhook routes, which call whichever domain's handler by tool name).
 *
 * State between tool calls lives in PhoneCall.draftCart — same JSON column
 * the ordering domain uses, just a different shape here (an "attendance
 * draft": service type, urgency, region, chosen slot) — rewritten whole on
 * every tool call, never patched incrementally, same convention as
 * DraftCart in the ordering domain.
 */

export type AttendanceDraft = {
  customerName?: string;
  serviceType?: string;
  urgency?: string;
  region?: string;
  scheduledSlotId?: string;
  scheduledDataHora?: string; // ISO
};

function emptyAttendanceDraft(): AttendanceDraft {
  return {};
}

function readAttendanceDraft(raw: Prisma.JsonValue | null): AttendanceDraft {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyAttendanceDraft();
  const v = raw as Record<string, unknown>;
  return {
    customerName: typeof v.customerName === "string" ? v.customerName : undefined,
    serviceType: typeof v.serviceType === "string" ? v.serviceType : undefined,
    urgency: typeof v.urgency === "string" ? v.urgency : undefined,
    region: typeof v.region === "string" ? v.region : undefined,
    scheduledSlotId: typeof v.scheduledSlotId === "string" ? v.scheduledSlotId : undefined,
    scheduledDataHora: typeof v.scheduledDataHora === "string" ? v.scheduledDataHora : undefined,
  };
}

function formatAttendanceDraftForPrompt(draft: AttendanceDraft): string {
  const lines: string[] = [];
  if (draft.serviceType) lines.push(`Serviço: ${draft.serviceType}`);
  if (draft.urgency) lines.push(`Urgência: ${draft.urgency}`);
  if (draft.region) lines.push(`Região: ${draft.region}`);
  if (draft.customerName) lines.push(`Nome do cliente: ${draft.customerName}`);
  if (draft.scheduledDataHora) lines.push(`Horário agendado: ${new Date(draft.scheduledDataHora).toLocaleString("pt-BR")}`);
  return lines.length > 0 ? lines.join("\n") : "(nada registrado ainda)";
}

// ---------- conversation start ----------

export async function startCall(params: {
  restaurantId: string;
  callerPhone: string;
  calledNumber: string;
  elevenLabsConversationId: string;
}): Promise<{ callId: string; systemPrompt: string; firstMessage: string }> {
  const { restaurantId, callerPhone, calledNumber, elevenLabsConversationId } = params;

  const call = await db.phoneCall.upsert({
    where: { elevenLabsConversationId },
    update: {},
    create: { restaurantId, callerPhone, calledNumber, elevenLabsConversationId, draftCart: emptyAttendanceDraft() as unknown as Prisma.InputJsonValue },
  });

  const restaurant = await db.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    select: { name: true, faqGenericoText: true, servicosGenericosJson: true },
  });
  const existingCustomer = await findExistingCustomerByPhone(restaurantId, callerPhone);
  const draft = readAttendanceDraft(call.draftCart as Prisma.JsonValue | null);

  const systemPrompt = buildGenericSystemPrompt({
    restaurantName: restaurant.name,
    faqText: restaurant.faqGenericoText,
    servicos: restaurant.servicosGenericosJson,
    existingCustomer,
    draft,
  });

  const firstMessage = existingCustomer
    ? `${restaurant.name}, boa tarde! Que bom te ouvir de novo. Em que posso ajudar?`
    : `${restaurant.name}, boa tarde! Como posso ajudar?`;

  return { callId: call.id, systemPrompt, firstMessage };
}

function buildGenericSystemPrompt(params: {
  restaurantName: string;
  faqText: string | null;
  servicos: Prisma.JsonValue | null;
  existingCustomer: { name: string; phone: string } | null;
  draft: AttendanceDraft;
}): string {
  const { restaurantName, faqText, servicos, existingCustomer, draft } = params;

  const customerSection = existingCustomer
    ? `Cliente já conhecido: ${existingCustomer.name}, telefone ${existingCustomer.phone}. Não pergunte o telefone de novo — só confirme o nome se fizer sentido na conversa.`
    : "Cliente novo — este número nunca ligou antes. Pergunte o nome durante a ligação, no momento natural (não logo de cara).";

  const servicosText =
    servicos && Array.isArray(servicos) && servicos.length > 0
      ? servicos.map((s) => (typeof s === "object" && s ? JSON.stringify(s) : String(s))).join("\n")
      : "(nenhum serviço/preço configurado — se perguntarem, diga que a equipe confirma em seguida)";

  // FAQ é sempre contexto estático embutido no prompt (mesmo padrão já
  // usado por Restaurant.faqText no agente de WhatsApp/pedido) — nunca uma
  // ferramenta chamável, evitando uma chamada de rede a mais por pergunta.
  return `Você é a recepcionista do negócio "${restaurantName}", atendendo uma ligação telefônica. Fale como uma atendente real, brasileira, educada e objetiva — nunca como um robô, nunca leia listas longas em voz alta, nunca repita informação que o cliente já deu.

REGRAS INEGOCIÁVEIS DA LIGAÇÃO:
- Frases curtas. Uma pergunta por vez. Nunca junte perguntas de assuntos diferentes.
- Nunca invente serviço, preço, disponibilidade ou informação fora do que está listado abaixo.
- Preços de serviços são sempre uma ESTIMATIVA sujeita a confirmação — nunca feche um valor definitivo por telefone, mesmo que o cliente insista.
- Para agendar um horário: primeiro chame buscar_horarios_disponiveis, ofereça 2-3 opções em voz alta, e só chame agendar_horario depois que o cliente escolher uma clara e explicitamente. Nunca diga "agendado" antes da ferramenta confirmar sucesso — se ela retornar erro (horário ocupado), ofereça outra opção.
- Ao longo da ligação, colete o tipo de serviço, urgência e região do cliente e chame qualificar_lead com o que já souber (pode chamar mais de uma vez, conforme for descobrindo mais informação).
- Se o cliente pedir para falar com uma pessoa, tiver uma reclamação, ou você não conseguir resolver algo, chame transferir_para_humano e informe educadamente que vai passar a ligação.
- Se algo der errado tecnicamente, explique com naturalidade ("deixa eu confirmar isso rapidinho") e nunca desligue a ligação sozinha.

CLIENTE:
${customerSection}

SERVIÇOS E PREÇOS BASE (sempre como estimativa, nunca fechado):
${servicosText}
${faqText ? `\nPERGUNTAS FREQUENTES:\n${faqText}` : ""}

ATENDIMENTO ATUAL:
${formatAttendanceDraftForPrompt(draft)}`;
}

// ---------- tools ----------

async function getCall(callId: string) {
  return db.phoneCall.findUniqueOrThrow({ where: { id: callId } });
}

async function setAttendanceDraft(callId: string, draft: AttendanceDraft) {
  await db.phoneCall.update({ where: { id: callId }, data: { draftCart: draft as unknown as Prisma.InputJsonValue } });
}

const buscarHorariosSchema = z.object({
  dataDesejada: z.string().optional(), // ISO date the caller mentioned, if any — best-effort, no hard validation
});

export async function handleBuscarHorariosDisponiveis(callId: string, input: unknown) {
  const parsed = buscarHorariosSchema.safeParse(input ?? {});
  if (!parsed.success) return { error: "Não entendi a data pedida." };

  const call = await getCall(callId);
  const from = parsed.data.dataDesejada ? new Date(parsed.data.dataDesejada) : new Date();
  const fromClamped = Number.isNaN(from.getTime()) || from < new Date() ? new Date() : from;

  const slots = await db.horarioDisponivel.findMany({
    where: { restaurantId: call.restaurantId, ocupado: false, dataHora: { gte: fromClamped } },
    orderBy: { dataHora: "asc" },
    take: 5,
  });

  if (slots.length === 0) return { horarios: [], mensagem: "Não há horários disponíveis nesse período no momento." };
  return {
    horarios: slots.map((s) => ({ id: s.id, dataHora: s.dataHora.toISOString(), duracaoMin: s.duracaoMin })),
  };
}

const agendarHorarioSchema = z.object({
  horarioId: z.string(),
  nomeCliente: z.string().optional(),
  servico: z.string().optional(),
});

/**
 * The guardrail from the spec (seção 8): never confirm a booking to the
 * caller before the server has actually, atomically, claimed the slot.
 * Same idiom already used elsewhere in this project for a similar race
 * (src/server/feedback/scheduler.ts's claim-via-conditional-updateMany) —
 * no transaction/lock needed, a conditional update is the atomic operation.
 */
export async function handleAgendarHorario(callId: string, input: unknown) {
  const parsed = agendarHorarioSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos para agendar o horário." };
  const { horarioId, nomeCliente, servico } = parsed.data;

  const call = await getCall(callId);
  const slot = await db.horarioDisponivel.findFirst({ where: { id: horarioId, restaurantId: call.restaurantId } });
  if (!slot) return { error: "Esse horário não foi encontrado." };

  const claim = await db.horarioDisponivel.updateMany({
    where: { id: horarioId, ocupado: false },
    data: { ocupado: true, callId },
  });
  if (claim.count === 0) {
    return { error: "Esse horário acabou de ser ocupado por outra pessoa — escolha outro." };
  }

  const draft = readAttendanceDraft(call.draftCart as Prisma.JsonValue | null);
  await setAttendanceDraft(callId, {
    ...draft,
    customerName: nomeCliente ?? draft.customerName,
    serviceType: servico ?? draft.serviceType,
    scheduledSlotId: slot.id,
    scheduledDataHora: slot.dataHora.toISOString(),
  });

  return { ok: true, dataHora: slot.dataHora.toISOString(), mensagem: "Horário agendado com sucesso." };
}

const qualificarLeadSchema = z.object({
  tipoServico: z.string().optional(),
  urgencia: z.string().optional(),
  regiao: z.string().optional(),
});

export async function handleQualificarLead(callId: string, input: unknown) {
  const parsed = qualificarLeadSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };

  const call = await getCall(callId);
  const draft = readAttendanceDraft(call.draftCart as Prisma.JsonValue | null);
  const next: AttendanceDraft = {
    ...draft,
    serviceType: parsed.data.tipoServico ?? draft.serviceType,
    urgency: parsed.data.urgencia ?? draft.urgency,
    region: parsed.data.regiao ?? draft.region,
  };
  await setAttendanceDraft(callId, next);
  return { ok: true, resumo: formatAttendanceDraftForPrompt(next) };
}
