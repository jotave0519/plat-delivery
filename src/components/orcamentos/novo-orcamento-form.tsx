"use client";

import { useState, useTransition } from "react";
import { Loader2, FileDown, Send, Plus, X } from "lucide-react";

import { criarOrcamentoManual, enviarOrcamentoManualPdf } from "@/server/actions/orcamento";
import { useToast } from "@/components/ui/toast";
import type { PricingRuleListItem } from "@/server/queries/orcamento";
import type { PricingLine } from "@/server/orcamento/pricing";

const inputClass =
  "rounded-[11px] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent";

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Resultado = { id: string; total: number; detalhamento: PricingLine[]; telefoneInformado: boolean };

/**
 * Manual quote creation, for a tenant that wants the pricing engine +
 * PDF/WhatsApp delivery without the AI conversing automatically on
 * WhatsApp (see criarOrcamentoManual). Not a replacement for the automated
 * flow — an additional path into the same Quote/calcularPreco machinery.
 */
export function NovoOrcamentoForm({ rules }: { rules: PricingRuleListItem[] }) {
  const [open, setOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [valores, setValores] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [pending, startTransition] = useTransition();
  const [sending, startSendTransition] = useTransition();
  const toast = useToast();

  const rulesRelevantes = rules.filter((r) => r.ativo && r.variavel !== "taxa_base");

  function reset() {
    setCustomerName("");
    setCustomerPhone("");
    setValores({});
    setResultado(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const dadosColetados: Record<string, number> = {};
    for (const r of rulesRelevantes) {
      const raw = valores[r.variavel];
      if (raw != null && raw !== "") dadosColetados[r.variavel] = Number(raw);
    }

    startTransition(async () => {
      const result = await criarOrcamentoManual({
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        dadosColetados,
      });
      if ("error" in result) {
        toast.error(result.faltando?.length ? `${result.error} Faltando: ${result.faltando.join(", ")}.` : (result.error ?? "Erro ao calcular orçamento."));
        return;
      }
      setResultado({ id: result.id, total: result.total, detalhamento: result.detalhamento, telefoneInformado: !!customerPhone.trim() });
      toast.success("Orçamento calculado.");
    });
  }

  function handleEnviarWhatsapp() {
    if (!resultado) return;
    startSendTransition(async () => {
      const result = await enviarOrcamentoManualPdf(resultado.id);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Orçamento enviado por WhatsApp.");
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-fit items-center gap-1.5 rounded-[10px] bg-charcoal px-4 py-2.5 text-[13.5px] font-medium text-white transition-colors hover:bg-accent-hover"
      >
        <Plus className="h-[14px] w-[14px]" />
        Novo orçamento manual
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-[18px] border border-[#EDEFF3] bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-[14px] font-semibold">Novo orçamento manual</h3>
          <p className="text-[12px] text-faint">Pra quando você monta o orçamento você mesmo, sem a IA conversando com o cliente pelo WhatsApp.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="flex-none rounded-[8px] p-1.5 text-faint transition-colors hover:bg-neutral-bg"
          title="Fechar"
        >
          <X className="h-[15px] w-[15px]" />
        </button>
      </div>

      {resultado ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 rounded-[13px] border border-border-soft p-3.5">
            {resultado.detalhamento.map((d) => (
              <div key={d.variavel} className="flex items-center justify-between text-[12.5px]">
                <span className="text-faint">{d.nome}</span>
                <span>{formatCurrency(d.valor)}</span>
              </div>
            ))}
            <div className="mt-1.5 flex items-center justify-between border-t border-border-soft pt-1.5 text-[14px] font-semibold">
              <span>Total</span>
              <span>{formatCurrency(resultado.total)}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/api/orcamentos/${resultado.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-[10px] border border-border-strong px-3.5 py-2 text-[12.5px] font-medium text-muted transition-colors hover:border-accent hover:text-accent-hover"
            >
              <FileDown className="h-[13px] w-[13px]" />
              Baixar PDF
            </a>
            <button
              type="button"
              onClick={handleEnviarWhatsapp}
              disabled={sending || !resultado.telefoneInformado}
              title={resultado.telefoneInformado ? undefined : "Informe o telefone do cliente pra poder enviar"}
              className="flex items-center gap-1.5 rounded-[10px] bg-charcoal px-3.5 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : <Send className="h-[13px] w-[13px]" />}
              Enviar por WhatsApp
            </button>
            <button
              type="button"
              onClick={reset}
              className="ml-auto text-[12.5px] font-medium text-faint transition-colors hover:text-muted"
            >
              Fazer outro
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <input className={inputClass} placeholder="Nome do cliente (opcional)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            <input
              className={inputClass}
              placeholder="Telefone do cliente (opcional — precisa pra enviar por WhatsApp)"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />
          </div>

          {rulesRelevantes.length === 0 ? (
            <p className="text-[12.5px] text-faint">Nenhuma regra de preço configurada ainda — cadastre em Configurações antes de criar um orçamento.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {rulesRelevantes.map((r) => (
                <label key={r.id} className="flex flex-col gap-1.5">
                  <span className="text-[12.5px] font-medium text-muted">
                    {r.nome} {r.obrigatoria ? <span className="text-faint">(obrigatório)</span> : <span className="text-faint">(opcional)</span>}
                  </span>
                  <input
                    className={inputClass}
                    type="number"
                    step="0.01"
                    required={r.obrigatoria}
                    value={valores[r.variavel] ?? ""}
                    onChange={(e) => setValores((prev) => ({ ...prev, [r.variavel]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={pending || rulesRelevantes.length === 0}
              className="flex min-h-[40px] items-center justify-center rounded-[10px] bg-charcoal px-5 text-[13.5px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : "Calcular orçamento"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
