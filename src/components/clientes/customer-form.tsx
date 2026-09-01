"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { saveCustomer } from "@/server/actions/clientes";

const inputClass =
  "rounded-[11px] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent";

export function CustomerForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: { id: string; name: string; phone: string | null; address: string | null; notes: string | null };
  /** Called after a successful save — the caller decides where to go next. */
  onSaved?: (customerId: string) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Informe o nome do cliente.");

    startTransition(async () => {
      const result = await saveCustomer({
        id: initial?.id,
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
      if (onSaved && result?.id) {
        onSaved(result.id);
      } else if (result?.id) {
        router.push(`/clientes/${result.id}`);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">Nome</span>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do cliente" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">Telefone (opcional)</span>
        <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">Endereço (opcional)</span>
        <input className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rua, número, bairro" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">Observações (opcional)</span>
        <textarea
          className={`${inputClass} resize-none`}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Preferências, alergias, informações úteis para o atendimento"
        />
      </label>

      {error ? <p className="rounded-[10px] bg-crit-bg px-3 py-2 text-[13px] text-crit-fg">{error}</p> : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex min-h-[42px] items-center justify-center rounded-[11px] bg-charcoal px-5 text-[13.5px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Salvando…" : "Salvar"}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className="text-[13px] font-medium text-muted hover:text-ink">
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  );
}
