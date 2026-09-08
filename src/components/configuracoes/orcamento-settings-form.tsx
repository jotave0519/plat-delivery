"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { saveQuoteSettings, savePricingRule, removePricingRule } from "@/server/actions/orcamento";
import { useToast } from "@/components/ui/toast";
import { ConfirmButton } from "@/components/ui/confirm-button";
import type { PricingRuleListItem } from "@/server/queries/orcamento";

const inputClass =
  "rounded-[11px] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent";

type QuoteSettings = { quoteAgentNicho: string | null; quoteFollowUpDias: number; quoteValidadeDias: number };

export function OrcamentoSettingsForm({ settings }: { settings: QuoteSettings }) {
  const [nicho, setNicho] = useState(settings.quoteAgentNicho ?? "");
  const [followUpDias, setFollowUpDias] = useState(String(settings.quoteFollowUpDias));
  const [validadeDias, setValidadeDias] = useState(String(settings.quoteValidadeDias));
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveQuoteSettings({
        quoteAgentNicho: nicho,
        quoteFollowUpDias: Number(followUpDias) || undefined,
        quoteValidadeDias: Number(validadeDias) || undefined,
      });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Configurações de orçamento salvas.");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">Nicho (descritivo — não muda as perguntas feitas)</span>
        <input className={inputClass} value={nicho} onChange={(e) => setNicho(e.target.value)} placeholder="ex.: jardinagem" />
        <span className="text-[11.5px] text-faint">As perguntas feitas na conversa vêm das regras de preço abaixo, não deste campo.</span>
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">Follow-up sem resposta (dias)</span>
          <input className={inputClass} type="number" min={1} value={followUpDias} onChange={(e) => setFollowUpDias(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">Validade do orçamento (dias)</span>
          <input className={inputClass} type="number" min={1} value={validadeDias} onChange={(e) => setValidadeDias(e.target.value)} />
        </label>
      </div>

      <div>
        <button
          type="submit"
          disabled={pending}
          className="flex min-h-[40px] items-center justify-center rounded-[10px] bg-charcoal px-5 text-[13.5px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : "Salvar"}
        </button>
      </div>
    </form>
  );
}

export function PricingRulesManager({ rules }: { rules: PricingRuleListItem[] }) {
  const [nome, setNome] = useState("");
  const [variavel, setVariavel] = useState("");
  const [valorUnitario, setValorUnitario] = useState("");
  const [obrigatoria, setObrigatoria] = useState(true);
  const [minimo, setMinimo] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await savePricingRule({
        nome,
        variavel,
        valorUnitario: Number(valorUnitario),
        obrigatoria,
        minimo: minimo ? Number(minimo) : undefined,
        ativo: true,
      });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Regra de preço adicionada.");
      setNome("");
      setVariavel("");
      setValorUnitario("");
      setMinimo("");
      setObrigatoria(true);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {rules.length === 0 ? (
          <p className="text-[12.5px] text-faint">Nenhuma regra de preço cadastrada — o orçamento automático não funciona sem pelo menos uma.</p>
        ) : (
          rules.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-[13px] border border-border-soft px-3.5 py-2.5">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[13px] font-medium">
                  {r.nome} <span className="text-faint">[{r.variavel}]</span>
                </span>
                <span className="truncate text-[11.5px] text-faint">
                  R$ {r.valorUnitario.toFixed(2)} {r.obrigatoria ? "· obrigatória" : "· opcional"}
                  {r.minimo != null ? ` · mínimo R$ ${r.minimo.toFixed(2)}` : ""}
                </span>
              </div>
              <ConfirmButton
                action={() => removePricingRule(r.id)}
                confirmMessage={`Remover a regra "${r.nome}"?`}
                icon={<Trash2 className="h-[14px] w-[14px]" />}
                title="Remover"
                className="flex-none rounded-[8px] p-1.5 text-faint transition-colors hover:bg-crit-bg hover:text-crit"
              />
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleAdd} className="flex flex-col gap-2.5 border-t border-border-soft pt-3.5">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <input className={inputClass} placeholder="Nome (ex.: valor por m²)" value={nome} onChange={(e) => setNome(e.target.value)} required />
          <input
            className={inputClass}
            placeholder="Variável (ex.: m2, km, taxa_base)"
            value={variavel}
            onChange={(e) => setVariavel(e.target.value)}
            required
          />
          <input
            className={inputClass}
            type="number"
            step="0.01"
            placeholder="Valor unitário (R$)"
            value={valorUnitario}
            onChange={(e) => setValorUnitario(e.target.value)}
            required
          />
          <input className={inputClass} type="number" step="0.01" placeholder="Mínimo (opcional)" value={minimo} onChange={(e) => setMinimo(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-[12.5px] text-muted">
          <input type="checkbox" checked={obrigatoria} onChange={(e) => setObrigatoria(e.target.checked)} />
          Obrigatória (sem esse dado, o agente oferece visita técnica em vez de calcular)
        </label>
        <div>
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-1.5 rounded-[10px] border border-border-strong px-3.5 py-2 text-[12.5px] font-medium text-muted transition-colors hover:border-accent hover:text-accent-hover disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : <Plus className="h-[13px] w-[13px]" />}
            Adicionar regra
          </button>
        </div>
      </form>
    </div>
  );
}
