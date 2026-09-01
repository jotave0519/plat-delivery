"use client";

import { useRef, useState } from "react";
import { Search, UserPlus, X, Loader2 } from "lucide-react";

import { searchCustomers } from "@/server/actions/orders";

export type SelectedCustomer = { id?: string; name: string; phone?: string; address?: string | null };
type CustomerResult = { id: string; name: string; phone: string | null; address: string | null };

const inputClass =
  "rounded-[11px] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent";

export function CustomerPicker({
  value,
  onChange,
}: {
  value: SelectedCustomer | null;
  onChange: (customer: SelectedCustomer | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced directly from the input's onChange rather than a useEffect
  // watching `query` — keeps the setState calls inside an event-driven
  // callback instead of an effect body.
  function handleQueryChange(next: string) {
    setQuery(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!next.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const found = await searchCustomers(next);
      setResults(found);
      setLoading(false);
    }, 250);
  }

  if (value) {
    return (
      <div className="flex items-start gap-3 rounded-[13px] border border-border-strong bg-surface px-3.5 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[14px] font-medium">{value.name}</span>
          {value.phone ? <span className="text-[12.5px] text-faint">{value.phone}</span> : null}
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="grid h-7 w-7 flex-none place-items-center rounded-[8px] text-faint transition-colors hover:bg-neutral-bg hover:text-crit"
          title="Trocar cliente"
        >
          <X className="h-[15px] w-[15px]" />
        </button>
      </div>
    );
  }

  if (creatingNew) {
    return (
      <div className="flex flex-col gap-2.5 rounded-[13px] border border-border-strong bg-surface p-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[12.5px] font-medium text-muted">Novo cliente</span>
          <button type="button" onClick={() => setCreatingNew(false)} className="text-[12px] text-faint hover:text-ink">
            cancelar
          </button>
        </div>
        <input
          className={inputClass}
          placeholder="Nome do cliente"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <input
          className={inputClass}
          placeholder="Telefone (opcional)"
          value={newPhone}
          onChange={(e) => setNewPhone(e.target.value)}
        />
        <button
          type="button"
          disabled={!newName.trim()}
          onClick={() => onChange({ name: newName.trim(), phone: newPhone.trim() || undefined })}
          className="mt-1 flex min-h-[38px] items-center justify-center rounded-[10px] bg-charcoal text-[13.5px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
        >
          Usar este cliente
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-[11px] border border-border-strong bg-surface px-3.5 py-2.5">
        <Search className="h-[15px] w-[15px] flex-none text-faint" />
        <input
          className="w-full bg-transparent text-sm outline-none placeholder:text-faint"
          placeholder="Buscar cliente por nome ou telefone"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
        />
        {loading ? <Loader2 className="h-[15px] w-[15px] flex-none animate-spin text-faint" /> : null}
      </div>

      {results.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-[13px] border border-border-soft p-1.5">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange({ id: c.id, name: c.name, phone: c.phone ?? undefined, address: c.address })}
              className="flex flex-col items-start gap-0.5 rounded-[9px] px-2.5 py-2 text-left transition-colors hover:bg-neutral-bg"
            >
              <span className="text-[13.5px] font-medium">{c.name}</span>
              {c.phone ? <span className="text-[12px] text-faint">{c.phone}</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setCreatingNew(true)}
        className="flex items-center justify-center gap-2 rounded-[10px] border border-dashed border-border-strong py-2 text-[13px] font-medium text-muted transition-colors hover:border-accent hover:text-accent-hover"
      >
        <UserPlus className="h-[15px] w-[15px]" />
        Cadastrar novo cliente
      </button>
    </div>
  );
}
