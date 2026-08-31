"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

export function CustomersSearchBar({ q }: { q: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    // Client-side navigation instead of a full browser GET.
    e.preventDefault();
    const value = inputRef.current?.value.trim() ?? "";
    router.push(value ? `/clientes?q=${encodeURIComponent(value)}` : "/clientes");
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 rounded-[11px] border border-border-strong bg-surface px-3.5 py-2.5">
      <Search className="h-[15px] w-[15px] flex-none text-faint" />
      <input
        ref={inputRef}
        type="text"
        name="q"
        defaultValue={q}
        placeholder="Buscar por nome ou telefone"
        className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-faint"
      />
    </form>
  );
}
