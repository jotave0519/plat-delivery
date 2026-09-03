"use client";

import { useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";

import { saveCategory } from "@/server/actions/cardapio";

export function AddCategoryForm() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await saveCategory({ name: name.trim() });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setName("");
      inputRef.current?.focus();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nova categoria (ex.: Sobremesas)"
        className="min-w-0 flex-1 rounded-[11px] border border-border-strong bg-surface px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-faint focus:border-accent"
      />
      <button
        type="submit"
        disabled={pending || !name.trim()}
        className="flex flex-none items-center gap-1.5 rounded-[11px] bg-charcoal px-3.5 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
      >
        <Plus className="h-[15px] w-[15px]" />
        Adicionar
      </button>
      {error ? <span className="text-[12.5px] text-crit-fg">{error}</span> : null}
    </form>
  );
}
