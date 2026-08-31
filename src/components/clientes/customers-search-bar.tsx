import { Search } from "lucide-react";

export function CustomersSearchBar({ q }: { q: string }) {
  return (
    <form action="/clientes" method="GET" className="flex items-center gap-2 rounded-[11px] border border-border-strong bg-surface px-3.5 py-2.5">
      <Search className="h-[15px] w-[15px] flex-none text-faint" />
      <input
        type="text"
        name="q"
        defaultValue={q}
        placeholder="Buscar por nome ou telefone"
        className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-faint"
      />
    </form>
  );
}
