import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { handleAtualizarPedido, handleConfirmarPedido, handleTransferirParaHumano } from "@/server/actions/telefonia-ia-chamada";

/**
 * One route for all three phone-agent tools (atualizar-pedido,
 * confirmar-pedido, transferir-para-humano) — the URL segment picks the
 * handler, matching exactly the tool names ElevenLabs is configured to call
 * (see src/server/integrations/elevenlabs/client.ts's toolDefinition, which
 * builds these same URLs). Each handler reuses the shared order/cart logic
 * from src/server/actions/telefonia-ia-chamada.ts — this route is only the
 * HTTP boundary (auth, call-id header, JSON in/out).
 */
const HANDLERS: Record<string, (callId: string, input: unknown) => Promise<unknown>> = {
  "atualizar-pedido": (callId, input) => handleAtualizarPedido(callId, input),
  "confirmar-pedido": (callId) => handleConfirmarPedido(callId),
  "transferir-para-humano": (callId) => handleTransferirParaHumano(callId),
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
