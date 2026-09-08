import "server-only";

import { db } from "@/lib/db";

export type PricingLine = { nome: string; variavel: string; valor: number };
export type CalcularPrecoResult =
  | { error: string; faltando: string[] }
  | { total: number; detalhamento: PricingLine[] };

/**
 * Agente 4's priceOrderItems — the sole place a Quote's precoCalculado is
 * ever computed, always re-derived from PricingRule on the server. The AI
 * only ever supplies `dadosColetados` (collected numbers), never a price —
 * same discipline as src/server/orders/pricing.ts.
 *
 * Deterministic: the same restaurantId + dadosColetados always produces the
 * same total (the MVP acceptance criterion) — no randomness, no external
 * call, no AI involved in this function at all.
 */
export async function calcularPreco(restaurantId: string, dadosColetados: Record<string, number>): Promise<CalcularPrecoResult> {
  const rules = await db.pricingRule.findMany({ where: { restaurantId, ativo: true } });

  if (rules.length === 0) {
    return { error: "Nenhuma regra de preço configurada para este negócio.", faltando: [] };
  }

  // Never guesses a value for a required variável that wasn't collected —
  // the "nunca chuta um valor, oferece visita técnica" guardrail (seção 7).
  // "taxa_base" is exempt: it's unconditionally applied, never "missing".
  const faltando = rules
    .filter((r) => r.obrigatoria && r.variavel !== "taxa_base" && dadosColetados[r.variavel] == null)
    .map((r) => r.nome);
  if (faltando.length > 0) {
    return { error: "Dados insuficientes para calcular um orçamento com segurança.", faltando };
  }

  let total = 0;
  const detalhamento: PricingLine[] = [];
  for (const rule of rules) {
    const quantidade = rule.variavel === "taxa_base" ? 1 : (dadosColetados[rule.variavel] ?? 0);
    let valor = Number(rule.valorUnitario) * quantidade;

    const condicao = rule.condicao as { minimo?: number } | null;
    if (condicao?.minimo != null && valor < condicao.minimo) valor = condicao.minimo;

    total += valor;
    detalhamento.push({ nome: rule.nome, variavel: rule.variavel, valor });
  }

  return { total, detalhamento };
}
