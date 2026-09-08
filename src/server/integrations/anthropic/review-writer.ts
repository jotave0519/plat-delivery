import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { env, isAnthropicConfigured } from "@/lib/env";
import type { ReviewSentiment } from "@/generated/prisma";

/**
 * Generates the reply text for a Google review — structured output via
 * client.messages.parse + zodOutputFormat, same pattern as
 * src/server/integrations/anthropic/menu-import.ts (a single-shot
 * generation, not the multi-turn tool-calling loop the ordering agents
 * use — there's no conversation here, just one review in, one draft out).
 *
 * The AI only ever produces the response TEXT. Whether that text gets
 * published automatically or held for the owner's approval is decided
 * beforehand by src/lib/review-sentiment.ts, from the star rating — never
 * by this function or its output.
 */

export class ReviewWriterNotConfiguredError extends Error {
  constructor() {
    super("Geração de resposta de avaliação não está configurada — defina ANTHROPIC_API_KEY.");
    this.name = "ReviewWriterNotConfiguredError";
  }
}

const reviewResponseSchema = z.object({
  draftResponse: z.string(),
});

const SYSTEM_PROMPT = `Você escreve respostas públicas a avaliações do Google Business Profile de um negócio, no tom de voz configurado pelo dono.

Regras inegociáveis:
- Nunca prometa algo concreto — reembolso, desconto, prazo, compensação de qualquer tipo — mesmo que o cliente peça ou reclame disso na avaliação. Se a avaliação mencionar um problema, agradeça o retorno e diga que a equipe vai analisar, sem prometer uma solução específica.
- Nunca invente detalhes sobre o que aconteceu no atendimento — responda de forma genérica e educada ao que está escrito na avaliação, sem supor fatos que não estão lá.
- Seja breve (2-4 frases). Nunca soe robótico ou repita a mesma estrutura de frase sempre.
- Sempre agradeça a avaliação, mesmo as negativas — o tom nunca é defensivo ou de confronto.
- Escreva em português do Brasil.`;

/**
 * `sentiment` is already decided (from the star rating) before this is
 * called — passed in only so the tone can adapt (uma resposta a uma
 * avaliação negativa não soa igual a uma positiva), never to let the model
 * re-decide anything about the flow.
 */
export async function gerarResposta(params: {
  reviewText: string | null;
  rating: number;
  sentiment: ReviewSentiment;
  tomDeVoz: string | null;
}): Promise<{ draftResponse: string }> {
  if (!isAnthropicConfigured) throw new ReviewWriterNotConfiguredError();
  const { reviewText, rating, sentiment, tomDeVoz } = params;

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const userText = `Nota: ${rating}/5 (classificada como ${sentiment}).
Texto da avaliação: ${reviewText?.trim() || "(o cliente não escreveu comentário, só deu a nota)"}
Tom de voz do negócio: ${tomDeVoz?.trim() || "cordial e profissional, sem formalidade excessiva"}

Escreva a resposta pública a esta avaliação.`;

  const response = await client.messages.parse({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userText }],
    output_config: { format: zodOutputFormat(reviewResponseSchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Não foi possível gerar uma resposta para esta avaliação.");
  }
  return response.parsed_output;
}
