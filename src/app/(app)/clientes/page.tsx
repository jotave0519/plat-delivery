import Link from "next/link";
import { Plus } from "lucide-react";

import { getTenant } from "@/lib/tenant";
import { listCustomers, CUSTOMERS_PAGE_SIZE } from "@/server/queries/clientes";
import { CustomersSearchBar } from "@/components/clientes/customers-search-bar";
import { CustomerCard } from "@/components/clientes/customer-card";

export default async function ClientesPage(props: PageProps<"/clientes">) {
  const searchParams = await props.searchParams;
  const tenant = await getTenant();

  const qParam = Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q;
  const q = qParam ?? "";
  const pageParam = Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page;
  const page = Math.max(1, Number(pageParam) || 1);

  const { items, total, hasMore } = await listCustomers(tenant.restaurantId, { q, page });

  const hrefForPage = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    sp.set("page", String(p));
    return `/clientes?${sp.toString()}`;
  };

  return (
    <div className="flex flex-col gap-5 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] font-semibold tracking-tight">Clientes</h1>
          <p className="text-[13px] text-faint">{total} cliente{total === 1 ? "" : "s"} cadastrado{total === 1 ? "" : "s"}</p>
        </div>
        <Link
          href="/clientes/novo"
          className="ml-auto flex items-center gap-2 rounded-[11px] bg-charcoal px-4 py-[11px] text-[13.5px] font-medium text-white transition-colors hover:bg-accent-hover active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Novo cliente
        </Link>
      </div>

      <CustomersSearchBar q={q} />

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[18px] border border-dashed border-border-strong py-16 text-center text-faint">
          <span className="text-[14px] font-medium text-[#3D4351]">Nenhum cliente encontrado</span>
          <span className="text-[12.5px]">Ajuste a busca ou cadastre um novo cliente</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((customer) => (
            <CustomerCard key={customer.id} customer={customer} />
          ))}
        </div>
      )}

      {(page > 1 || hasMore) && items.length > 0 ? (
        <div className="flex items-center justify-center gap-3 pt-2">
          {page > 1 ? (
            <Link href={hrefForPage(page - 1)} className="rounded-[10px] border border-border-strong px-4 py-2 text-[13px] font-medium text-muted hover:text-ink">
              ← Anterior
            </Link>
          ) : null}
          <span className="text-[12.5px] text-faint">
            página {page} · {Math.ceil(total / CUSTOMERS_PAGE_SIZE)}
          </span>
          {hasMore ? (
            <Link href={hrefForPage(page + 1)} className="rounded-[10px] border border-border-strong px-4 py-2 text-[13px] font-medium text-muted hover:text-ink">
              Próxima →
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
