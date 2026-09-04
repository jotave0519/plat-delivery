import "server-only";

import { env, isElevenLabsConfigured } from "@/lib/env";

/**
 * Thin, typed wrapper around the ElevenLabs Conversational AI (Agents)
 * REST API — same "one isolated place to talk to the external API from"
 * pattern as src/server/integrations/evolution/client.ts.
 *
 * The request shape below follows ElevenLabs' documented Agents API
 * (conversation_config.agent.prompt / conversation_config.tts) as of this
 * writing, but is NOT yet confirmed against a real account (no
 * ELEVENLABS_API_KEY was available while building this) — same situation
 * evolution/client.ts was in before its first real test. Verify the exact
 * field names on the first real call and adjust here only, without
 * touching the rest of the phone-agent code.
 */

export class ElevenLabsNotConfiguredError extends Error {
  constructor() {
    super("ElevenLabs não configurada — defina ELEVENLABS_API_KEY e ELEVENLABS_WEBHOOK_SECRET.");
    this.name = "ElevenLabsNotConfiguredError";
  }
}

async function elevenLabsRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!isElevenLabsConfigured) throw new ElevenLabsNotConfiguredError();

  const res = await fetch(`https://api.elevenlabs.io${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": env.ELEVENLABS_API_KEY!,
      ...init.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ElevenLabs respondeu ${res.status} em ${path}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export type CreateOrUpdateAgentParams = {
  /** Present to update an existing agent instead of creating a new one. */
  agentId?: string;
  name: string;
  firstMessage: string;
  systemPrompt: string;
  /** Base URL of this app (e.g. https://seu-dominio.com) — used to build the tool/webhook URLs below. */
  webhookBaseUrl: string;
  /** Our own shared secret, sent to ElevenLabs as a secret dynamic variable and echoed back in every tool-call header — never exposed to the LLM. */
  webhookSecret: string;
};

export type AgentResult = { agent_id: string };

/**
 * Creates (agentId omitted) or fully overwrites (agentId given) the
 * restaurant's phone-order agent: voice (pt-BR), LLM (Claude), the system
 * prompt shell, and the tool webhooks pointing back at our own server. The
 * per-call specifics (real catalog, customer recognition) are injected
 * separately at call time by the conversation-initiation webhook
 * (src/app/api/telefonia/elevenlabs/[token]/iniciar/route.ts) — this call
 * only sets up the agent's static shape, once.
 */
export function createOrUpdateAgent(params: CreateOrUpdateAgentParams): Promise<AgentResult> {
  const { agentId, name, firstMessage, systemPrompt, webhookBaseUrl, webhookSecret } = params;

  const body = {
    name,
    conversation_config: {
      agent: {
        first_message: firstMessage,
        language: "pt",
        prompt: {
          prompt: systemPrompt,
          llm: "claude-sonnet-4-5",
          tools: [
            toolDefinition("atualizar_pedido", "Atualiza o carrinho em construção do pedido — itens, entrega/retirada, endereço, forma de pagamento, nome/telefone do cliente.", webhookBaseUrl, webhookSecret),
            toolDefinition("confirmar_pedido", "Confirma o pedido já resumido para o cliente e cria o pedido de verdade.", webhookBaseUrl, webhookSecret),
            toolDefinition("transferir_para_humano", "Encaminha a ligação para um atendente humano.", webhookBaseUrl, webhookSecret),
          ],
        },
      },
      tts: {
        model_id: "eleven_flash_v2_5",
      },
    },
  };

  return agentId
    ? elevenLabsRequest<AgentResult>(`/v1/convai/agents/${agentId}`, { method: "PATCH", body: JSON.stringify(body) })
    : elevenLabsRequest<AgentResult>("/v1/convai/agents/create", { method: "POST", body: JSON.stringify(body) });
}

function toolDefinition(name: string, description: string, webhookBaseUrl: string, webhookSecret: string) {
  return {
    type: "webhook",
    name,
    description,
    api_schema: {
      url: `${webhookBaseUrl}/api/telefonia/elevenlabs/${webhookSecret}/ferramentas/${name.replace(/_/g, "-")}`,
      method: "POST",
      // Resolves the secret__call_id dynamic variable (set at conversation
      // start — see the "iniciar" webhook route) into a header on every
      // tool call, so our server knows which PhoneCall this belongs to
      // without the LLM having to generate/copy an id itself. Field name
      // ("request_headers") follows ElevenLabs' documented dynamic-variable
      // templating convention ({{var}}) but is NOT yet confirmed against a
      // real agent config — verify and adjust here on first real setup.
      request_headers: { "X-Call-Id": "{{secret__call_id}}" },
    },
  };
}

export function deleteAgent(agentId: string) {
  return elevenLabsRequest<unknown>(`/v1/convai/agents/${agentId}`, { method: "DELETE" });
}
