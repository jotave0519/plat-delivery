import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { env, isAnthropicConfigured } from "@/lib/env";

/**
 * Reads a menu (PDF or photo) and extracts categories/products via Claude's
 * vision/document input + structured outputs — no separate OCR/PDF-parsing
 * library needed, Claude accepts the raw file directly. This module only
 * calls the AI and returns a validated draft; it never touches the
 * database (see src/server/actions/cardapio-import.ts for that boundary —
 * interpretation and persistence are deliberately kept apart, per the
 * "never turn an AI response directly into a DB insert" rule).
 */

export class MenuImportNotConfiguredError extends Error {
  constructor() {
    super("Importação de cardápio por IA não está configurada — defina ANTHROPIC_API_KEY.");
    this.name = "MenuImportNotConfiguredError";
  }
}

const extractedProductSchema = z.object({
  name: z.string(),
  /** null when the menu doesn't show one — never invent a description. */
  description: z.string().nullable(),
  /** In BRL, e.g. 59.9. null when the price can't be read with confidence. */
  price: z.number().nullable(),
});

const extractedCategorySchema = z.object({
  name: z.string(),
  products: z.array(extractedProductSchema),
});

export const extractedMenuSchema = z.object({
  categories: z.array(extractedCategorySchema),
});

export type ExtractedMenu = z.infer<typeof extractedMenuSchema>;

const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type SupportedMenuFileType = "application/pdf" | (typeof SUPPORTED_IMAGE_TYPES)[number];
export const SUPPORTED_MENU_FILE_TYPES: SupportedMenuFileType[] = ["application/pdf", ...SUPPORTED_IMAGE_TYPES];

/** ~14MB of raw file — leaves headroom under the 20mb Server Action body limit once base64-encoded (~1.35x). */
export const MAX_MENU_FILE_BYTES = 14 * 1024 * 1024;

const SYSTEM_PROMPT = `Você lê cardápios de estabelecimentos de comida e delivery — restaurantes, lanchonetes, pizzarias, hamburguerias, cafeterias, docerias, sorveterias, açaiterias, restaurantes japoneses, ou qualquer outro tipo — a partir de uma foto ou PDF, e extrai a estrutura de categorias e produtos em formato estruturado.

Regras:
- Nunca invente informação que não esteja visível no arquivo. Se um preço, descrição ou categoria não estiver claro o suficiente, deixe o campo como null em vez de adivinhar.
- Preserve nomes de produtos e categorias como aparecem no cardápio, corrigindo só erros óbvios de digitação/leitura.
- Preço é um número em reais (ex.: 59.9), sem o símbolo "R$". Se houver várias opções de preço para o mesmo item (ex.: tamanhos), use o menor valor e mencione a variação na descrição, já que apenas um preço por item é suportado nesta etapa.
- Não inclua como produto nada que claramente não seja um item vendável (endereço, horário de funcionamento, texto decorativo, redes sociais).
- Nunca assuma que é uma pizzaria ou qualquer tipo específico — funciona para qualquer estabelecimento.`;

export async function extractMenuFromFile(base64Data: string, mimeType: SupportedMenuFileType): Promise<ExtractedMenu> {
  if (!isAnthropicConfigured) throw new MenuImportNotConfiguredError();

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const fileBlock: Anthropic.ContentBlockParam =
    mimeType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Data } }
      : { type: "image", source: { type: "base64", media_type: mimeType, data: base64Data } };

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [fileBlock, { type: "text", text: "Extraia as categorias e produtos deste cardápio." }],
      },
    ],
    output_config: { format: zodOutputFormat(extractedMenuSchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Não foi possível interpretar esse arquivo como um cardápio.");
  }
  return response.parsed_output;
}
