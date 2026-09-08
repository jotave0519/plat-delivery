"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { saveDespachoSettings, saveTecnico, removeTecnico } from "@/server/actions/despacho";
import { useToast } from "@/components/ui/toast";
import { ConfirmButton } from "@/components/ui/confirm-button";
import type { TecnicoListItem } from "@/server/queries/despacho";

const inputClass =
  "rounded-[11px] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent";

type DespachoSettings = { despachoEscalationPhone: string | null; despachoOfertaTimeoutMinutos: number };

/**
 * Whether the despacho agent actually runs is decided by the shared
 * whatsapp-domain-settings-form.tsx selector, not here — this form only
 * owns despacho-specific fields (escalation phone, technician timeout),
 * always editable regardless of which domain is currently active, so
 * switching the domain back to DESPACHO later doesn't lose prior settings.
 */
export function DespachoSettingsForm({ settings }: { settings: DespachoSettings }) {
  const [escalationPhone, setEscalationPhone] = useState(settings.despachoEscalationPhone ?? "");
  const [timeoutMinutos, setTimeoutMinutos] = useState(String(settings.despachoOfertaTimeoutMinutos));
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const minutos = Number(timeoutMinutos);
    startTransition(async () => {
      const result = await saveDespachoSettings({
        despachoEscalationPhone: escalationPhone,
        despachoOfertaTimeoutMinutos: Number.isFinite(minutos) && minutos > 0 ? minutos : undefined,
      });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Configurações de despacho salvas.");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">Telefone de escalação (WhatsApp)</span>
        <input className={inputClass} value={escalationPhone} onChange={(e) => setEscalationPhone(e.target.value)} placeholder="+55 11 90000-0000" />
        <span className="text-[11.5px] text-faint">Para onde vai o alerta quando nenhum técnico aceita ou nenhum está disponível.</span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">Timeout de resposta do técnico (minutos)</span>
        <input
          className={inputClass}
          type="number"
          min={1}
          value={timeoutMinutos}
          onChange={(e) => setTimeoutMinutos(e.target.value)}
        />
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

export function TecnicosManager({ tecnicos }: { tecnicos: TecnicoListItem[] }) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [especialidades, setEspecialidades] = useState("");
  const [regioes, setRegioes] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveTecnico({
        nome,
        telefone,
        especialidades: especialidades.split(",").map((s) => s.trim()).filter(Boolean),
        regioes: regioes.split(",").map((s) => s.trim()).filter(Boolean),
        disponivel: true,
      });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Técnico adicionado.");
      setNome("");
      setTelefone("");
      setEspecialidades("");
      setRegioes("");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {tecnicos.length === 0 ? (
          <p className="text-[12.5px] text-faint">Nenhum técnico cadastrado ainda.</p>
        ) : (
          tecnicos.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 rounded-[13px] border border-border-soft px-3.5 py-2.5">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[13px] font-medium">{t.nome}</span>
                <span className="truncate text-[11.5px] text-faint">
                  {t.telefone} {t.especialidades.length > 0 ? `· ${t.especialidades.join(", ")}` : ""}
                  {t.regioes.length > 0 ? ` · ${t.regioes.join(", ")}` : ""}
                </span>
              </div>
              <ConfirmButton
                action={() => removeTecnico(t.id)}
                confirmMessage={`Remover ${t.nome}?`}
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
          <input className={inputClass} placeholder="Especialidades (separadas por vírgula)" value={especialidades} onChange={(e) => setEspecialidades(e.target.value)} />
          <input className={inputClass} placeholder="Regiões (separadas por vírgula)" value={regioes} onChange={(e) => setRegioes(e.target.value)} />
        </div>
        <div>
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-1.5 rounded-[10px] border border-border-strong px-3.5 py-2 text-[12.5px] font-medium text-muted transition-colors hover:border-accent hover:text-accent-hover disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : <Plus className="h-[13px] w-[13px]" />}
            Adicionar técnico
          </button>
        </div>
      </form>
    </div>
  );
}
