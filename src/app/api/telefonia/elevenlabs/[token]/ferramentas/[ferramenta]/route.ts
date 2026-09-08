import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { handleAtualizarPedido, handleConfirmarPedido, handleTransferirParaHumano } from "@/server/actions/telefonia-ia-chamada";
import {
  handleBuscarHorariosDisponiveis,
  handleAgendarHorario,
  handleQualificarLead,
} from "@/server/actions/atendimento-generico-ia-chamada";

/**
 * One route for every phone-agent tool, across both domains (PEDIDO and
 * ATENDIMENTO_GENERICO) — the URL segment picks the handler, matching
 * exactly the tool names each domain's agent is configured with (see
 * src/server/integrations/elevenlabs/client.ts's webhookToolDefinition).
 * No domain check is needed here: a PEDIDO agent is never configured with
 * "agendar-horario" as one of its tools, and vice-versa, so the tool name
 * alone is unambiguous. "transferir-para-humano" is the one name shared by
 * both domains, reusing the exact same (domain-agnostic) handler.
 */
const HANDLERS: Record<string, (callId: string, input: unknown) => Promise<unknown>> = {
  "atualizar-pedido": (callId, input) => handleAtualizarPedido(callId, input),
  "confirmar-pedido": (callId) => handleConfirmarPedido(callId),
  "transferir-para-humano": (callId) => handleTransferirParaHumano(callId),
  "buscar-horarios-disponiveis": (callId, input) => handleBuscarHorariosDisponiveis(callId, input),
  "agendar-horario": (callId, input) => handleAgendarHorario(callId, input),
  "qualificar-lead": (callId, input) => handleQualificarLead(callId, input),
};

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/telefonia/elevenlabs/[token]/ferramentas/[ferramenta]">,
) {
  const { token, ferramenta } = await ctx.params;
  if (!env.ELEVENLABS_WEBHOOK_SECRET || token !== env.ELEVENLABS_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Injected via the secret__call_id dynamic variable set at conversation
  // start (see the "iniciar" webhook) — echoed back in this header per the
  // tool's own request_headers config. Not the LLM's job to generate.
  const callId = request.headers.get("x-call-id");
  if (!callId) return NextResponse.json({ error: "missing X-Call-Id header" }, { status: 400 });

  const handler = HANDLERS[ferramenta];
  if (!handler) return NextResponse.json({ error: `unknown tool "${ferramenta}"` }, { status: 404 });

  let input: unknown = {};
  try {
    input = await request.json();
  } catch {
    // A tool with no parameters (confirmar-pedido, transferir-para-humano)
    // may send an empty body — that's fine, handlers that need input
    // validate it themselves.
  }

  try {
    const result = await handler(callId, input);
    return NextResponse.json(result);
  } catch (err) {
    console.error(`Falha na ferramenta de telefonia "${ferramenta}":`, err);
    return NextResponse.json({ error: "Não foi possível processar agora." }, { status: 500 });
  }
}
