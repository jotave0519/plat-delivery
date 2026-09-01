import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { env, isAnthropicConfigured } from "@/lib/env";

/**
 * The Anthropic-specific half of the WhatsApp ordering agent: builds the
 * request, runs the tool-calling loop, returns the final reply text. Zero
 * database access here — every tool's actual implementation (querying the
 * real menu, writing the draft cart, creating the real order) lives in
 * src/server/actions/atendimento-ia-conversa.ts and is passed in as a
 * plain async function, the same split already used for the menu-import
 * feature (src/server/integrations/anthropic/menu-import.ts is the API
 * wrapper, src/server/actions/cardapio-import.ts does the DB work).
 *
 * Manual tool loop (not the SDK's tool_runner) — this request must resolve
 * to exactly one final reply and exit; every tool has a real side effect
 * (a draft-cart write, an actual Order creation), so each step is executed
 * explicitly rather than through a beta helper.
 */

export class WhatsappAgentNotConfiguredError extends Error {
  constructor() {
    super("Agente de atendimento por IA não está configurado — defina ANTHROPIC_API_KEY.");
    this.name = "WhatsappAgentNotConfiguredError";
  }
}

export type AgentTool = {
  name: string;
  description: string;
  input_schema: Anthropic.Tool.InputSchema;
};

export type AgentToolHandler = (input: Record<string, unknown>) => Promise<Record<string, unknown>>;

export type AgentTurn = { role: "user" | "assistant"; content: string };

const MAX_TOOL_ITERATIONS = 6;

export async function runWhatsappAgent(params: {
  systemPrompt: string;
  history: AgentTurn[];
  userMessage: string;
  tools: AgentTool[];
  toolHandlers: Record<string, AgentToolHandler>;
}): Promise<string> {
  if (!isAnthropicConfigured) throw new WhatsappAgentNotConfiguredError();

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const messages: Anthropic.MessageParam[] = [
    ...params.history.map((turn) => ({ role: turn.role, content: turn.content }) as Anthropic.MessageParam),
    { role: "user", content: params.userMessage },
  ];

  const tools: Anthropic.Tool[] = params.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 2048,
      system: params.systemPrompt,
      messages,
      tools,
    });

    const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

    if (toolUseBlocks.length === 0) {
      const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
      return textBlock?.text ?? "Desculpe, não consegui processar sua mensagem agora. Pode repetir?";
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUseBlocks) {
      const handler = params.toolHandlers[toolUse.name];
      try {
        const input = (toolUse.input ?? {}) as Record<string, unknown>;
        const result = handler ? await handler(input) : { error: `Ferramenta desconhecida: ${toolUse.name}` };
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(result) });
      } catch (err) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify({ error: err instanceof Error ? err.message : "Erro inesperado." }),
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  return "Desculpe, tive um problema para concluir seu atendimento agora. Um atendente vai continuar por aqui.";
}
