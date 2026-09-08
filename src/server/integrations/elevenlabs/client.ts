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

export type AgentToolSpec = { name: string; description: string };

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
  /**
   * The webhook tools this agent's domain needs (e.g. atualizar_pedido/
   * confirmar_pedido for the ordering domain, or buscar_horarios_disponiveis/
   * agendar_horario/qualificar_lead for the generic-attendance domain) —
   * transferir_para_humano is shared by every domain and should be included
   * here by whichever caller needs it (src/server/actions/telefonia-ia-chamada.ts
   * and src/server/actions/atendimento-generico-ia-chamada.ts both expose a
   * handler for it, reusing the exact same underlying logic).
   */
  tools: AgentToolSpec[];
  /**
   * Restaurant.phoneAgentHumanTransferNumber — when present, configures
   * ElevenLabs' native transfer_to_number system tool (the thing that
   * actually moves the call to a human phone; our own
   * "transferir_para_humano" webhook tool only records the handoff for
   * history/monitoring, it never transfers anyone by itself). Omitted
   * entirely when no transfer number is configured yet.
   */
  humanTransferNumber?: string;
};

export type AgentResult = { agent_id: string };

/**
 * Creates (agentId omitted) or fully overwrites (agentId given) a
 * restaurant's ElevenLabs agent — voice (pt-BR), LLM (Claude), the system
 * prompt shell, and the tool webhooks pointing back at our own server. The
 * per-call specifics (real catalog/FAQ, customer recognition) are injected
 * separately at call time by the conversation-initiation webhook
 * (src/app/api/telefonia/elevenlabs/[token]/iniciar/route.ts) — this call
 * only sets up the agent's static shape, once. Shared by every phone-agent
 * domain (PEDIDO and ATENDIMENTO_GENERICO) — the `tools` param is what
 * varies between them, not this function.
 */
export function createOrUpdateAgent(params: CreateOrUpdateAgentParams): Promise<AgentResult> {
  const { agentId, name, firstMessage, systemPrompt, webhookBaseUrl, webhookSecret, tools, humanTransferNumber } = params;

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
            ...tools.map((t) => webhookToolDefinition(t.name, t.description, webhookBaseUrl, webhookSecret)),
            ...(humanTransferNumber ? [transferToNumberToolDefinition(humanTransferNumber)] : []),
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

function webhookToolDefinition(name: string, description: string, webhookBaseUrl: string, webhookSecret: string) {
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

/**
 * ElevenLabs' native system tool that actually moves the call — confirmed
 * shape via the platform's own tool-creation schema (system_tool_type:
 * "transfer_to_number", transfers[].transfer_destination). Was missing
 * entirely before (a real gap: our own "transferir_para_humano" webhook
 * tool only ever logged the handoff, nothing actually transferred the
 * call) — added now for every domain that configures a transfer number.
 */
function transferToNumberToolDefinition(humanTransferNumber: string) {
  return {
    type: "system",
    name: "transferir_ligacao",
    description: "Transfere a ligação para um atendente humano — use junto com transferir_para_humano, quando o cliente pedir para falar com uma pessoa ou a situação não puder ser resolvida pela IA.",
    params: {
      system_tool_type: "transfer_to_number",
      transfers: [
        {
          condition: "O cliente pediu para falar com uma pessoa, ou a IA não consegue resolver a situação.",
          transfer_destination: { type: "phone", phone_number: humanTransferNumber },
        },
      ],
    },
  };
}

export function deleteAgent(agentId: string) {
  return elevenLabsRequest<unknown>(`/v1/convai/agents/${agentId}`, { method: "DELETE" });
}
