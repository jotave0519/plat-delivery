"use client";

import { useState, useTransition } from "react";

import { saveRestaurantInfo } from "@/server/actions/configuracoes";
import type { RestaurantSettings } from "@/server/queries/configuracoes";
import { useToast } from "@/components/ui/toast";

const inputClass =
  "rounded-[11px] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent";

export function RestaurantForm({ restaurant }: { restaurant: RestaurantSettings }) {
  const [name, setName] = useState(restaurant.name);
  const [phone, setPhone] = useState(restaurant.phone ?? "");
  const [address, setAddress] = useState(restaurant.address ?? "");
  const [pixKey, setPixKey] = useState(restaurant.pixKey ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (!name.trim()) return setError("Informe o nome do restaurante.");

    startTransition(async () => {
      const result = await saveRestaurantInfo({ name, phone, address, pixKey });
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      setSaved(true);
      toast.success("Dados do restaurante salvos.");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-[13px] font-medium text-muted">Nome do restaurante</span>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">Telefone</span>
        <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 4002-8922" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">Chave Pix</span>
        <input className={inputClass} value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="e-mail, telefone ou chave aleatória" />
      </label>
      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-[13px] font-medium text-muted">Endereço</span>
        <input className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} />
      </label>

      {error ? <p className="rounded-[10px] bg-crit-bg px-3 py-2 text-[13px] text-crit-fg sm:col-span-2">{error}</p> : null}

      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="flex min-h-[40px] items-center justify-center rounded-[10px] bg-charcoal px-5 text-[13.5px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Salvando…" : "Salvar"}
        </button>
        {saved ? <span className="text-[12.5px] text-ok-fg">Salvo</span> : null}
      </div>
    </form>
  );
}
