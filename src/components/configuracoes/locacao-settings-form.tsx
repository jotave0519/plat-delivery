"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { saveLocacaoSettings, saveCorretor, removeCorretor, saveImovel, removeImovel } from "@/server/actions/locacao";
import { useToast } from "@/components/ui/toast";
import { ConfirmButton } from "@/components/ui/confirm-button";
import type { CorretorListItem, ImovelListItem } from "@/server/queries/locacao";

const inputClass =
  "rounded-[11px] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent";

export function LocacaoSettingsForm({ settings }: { settings: { locacaoVisitaDuracaoMin: number } }) {
  const [duracao, setDuracao] = useState(String(settings.locacaoVisitaDuracaoMin));
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveLocacaoSettings({ locacaoVisitaDuracaoMin: Number(duracao) || undefined });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Configurações de locação salvas.");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">Janela de conflito de agenda (minutos)</span>
        <input className={inputClass} type="number" min={1} value={duracao} onChange={(e) => setDuracao(e.target.value)} />
        <span className="text-[11.5px] text-faint">Bloqueia novos agendamentos para o mesmo corretor dentro dessa janela ao redor de uma visita já marcada.</span>
      </label>
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

export function CorretoresManager({ corretores }: { corretores: CorretorListItem[] }) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveCorretor({ nome, telefone, disponivel: true });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Corretor adicionado.");
      setNome("");
      setTelefone("");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {corretores.length === 0 ? (
          <p className="text-[12.5px] text-faint">Nenhum corretor cadastrado — sem isso, não é possível agendar visitas.</p>
        ) : (
          corretores.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-[13px] border border-border-soft px-3.5 py-2.5">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[13px] font-medium">{c.nome}</span>
                <span className="truncate text-[11.5px] text-faint">{c.telefone}</span>
              </div>
              <ConfirmButton
                action={() => removeCorretor(c.id)}
                confirmMessage={`Remover ${c.nome}?`}
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
          <input className={inputClass} placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
          <input className={inputClass} placeholder="Telefone (WhatsApp)" value={telefone} onChange={(e) => setTelefone(e.target.value)} required />
        </div>
        <div>
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-1.5 rounded-[10px] border border-border-strong px-3.5 py-2 text-[12.5px] font-medium text-muted transition-colors hover:border-accent hover:text-accent-hover disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : <Plus className="h-[13px] w-[13px]" />}
            Adicionar corretor
          </button>
        </div>
      </form>
    </div>
  );
}

export function ImoveisManager({ imoveis, corretores }: { imoveis: ImovelListItem[]; corretores: CorretorListItem[] }) {
  const [endereco, setEndereco] = useState("");
  const [valorAluguel, setValorAluguel] = useState("");
  const [condicoes, setCondicoes] = useState("");
  const [fotos, setFotos] = useState("");
  const [corretorId, setCorretorId] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveImovel({
        endereco,
        valorAluguel: Number(valorAluguel),
        condicoes,
        fotos: fotos.split("\n").map((f) => f.trim()).filter(Boolean),
        corretorId: corretorId || undefined,
        disponivel: true,
      });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Imóvel cadastrado.");
      setEndereco("");
      setValorAluguel("");
      setCondicoes("");
      setFotos("");
      setCorretorId("");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {imoveis.length === 0 ? (
          <p className="text-[12.5px] text-faint">Nenhum imóvel cadastrado ainda.</p>
        ) : (
          imoveis.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-3 rounded-[13px] border border-border-soft px-3.5 py-2.5">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[13px] font-medium">{i.endereco}</span>
                <span className="truncate text-[11.5px] text-faint">
                  R$ {i.valorAluguel.toFixed(2)} {i.corretorNome ? `· ${i.corretorNome}` : ""} {!i.disponivel ? "· indisponível" : ""}
                </span>
              </div>
              <ConfirmButton
                action={() => removeImovel(i.id)}
                confirmMessage={`Remover o imóvel "${i.endereco}"?`}
                icon={<Trash2 className="h-[14px] w-[14px]" />}
                title="Remover"
                className="flex-none rounded-[8px] p-1.5 text-faint transition-colors hover:bg-crit-bg hover:text-crit"
              />
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleAdd} className="flex flex-col gap-2.5 border-t border-border-soft pt-3.5">
        <input className={inputClass} placeholder="Endereço" value={endereco} onChange={(e) => setEndereco(e.target.value)} required />
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <input
            className={inputClass}
            type="number"
            step="0.01"
            placeholder="Valor do aluguel (R$)"
            value={valorAluguel}
            onChange={(e) => setValorAluguel(e.target.value)}
            required
          />
          <select className={inputClass} value={corretorId} onChange={(e) => setCorretorId(e.target.value)}>
            <option value="">Corretor responsável (opcional)</option>
            {corretores.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </div>
        <textarea className={inputClass} placeholder="Condições (opcional)" value={condicoes} onChange={(e) => setCondicoes(e.target.value)} rows={2} />
        <textarea
          className={inputClass}
          placeholder="URLs de fotos, uma por linha (opcional)"
          value={fotos}
          onChange={(e) => setFotos(e.target.value)}
          rows={2}
        />
        <div>
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-1.5 rounded-[10px] border border-border-strong px-3.5 py-2 text-[12.5px] font-medium text-muted transition-colors hover:border-accent hover:text-accent-hover disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : <Plus className="h-[13px] w-[13px]" />}
            Adicionar imóvel
          </button>
        </div>
      </form>
    </div>
  );
}
