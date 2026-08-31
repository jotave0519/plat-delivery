"use client";

import Image from "next/image";
import Link from "next/link";
import { useTransition } from "react";
import { Pencil, EyeOff, Eye, Trash2, ImageOff } from "lucide-react";

import { formatBRL } from "@/lib/format";
import { deleteProduct, toggleProductAvailability } from "@/server/actions/cardapio";
import type { CardapioProduct } from "@/server/queries/cardapio";

export function ProductCard({ product }: { product: CardapioProduct }) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Excluir "${product.name}"? Essa ação não pode ser desfeita.`)) return;
    startTransition(async () => {
      const result = await deleteProduct(product.id);
      if (result?.error) alert(result.error);
    });
  }

  return (
    <div
      className={`flex flex-col gap-3 rounded-[16px] border border-border-soft p-3.5 transition-opacity ${
        product.isAvailable ? "" : "opacity-60"
      }`}
    >
      <div className="flex gap-3">
        <div className="grid h-14 w-14 flex-none place-items-center overflow-hidden rounded-[11px] bg-neutral-bg text-faint">
          {product.imageUrl ? (
            <Image src={product.imageUrl} alt={product.name} width={56} height={56} className="h-full w-full object-cover" unoptimized />
          ) : (
            <ImageOff className="h-5 w-5" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[14px] font-medium">{product.name}</span>
          <span className="text-[13.5px] font-semibold text-ink">{formatBRL(product.price)}</span>
          {!product.isAvailable ? <span className="text-[11.5px] font-medium text-warn-fg">Pausado</span> : null}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => toggleProductAvailability(product.id))}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-[9px] border border-border-strong py-1.5 text-[12.5px] font-medium text-muted transition-colors hover:border-accent hover:text-accent-hover disabled:opacity-50"
        >
          {product.isAvailable ? <EyeOff className="h-[13px] w-[13px]" /> : <Eye className="h-[13px] w-[13px]" />}
          {product.isAvailable ? "Pausar" : "Ativar"}
        </button>
        <Link
          href={`/cardapio/produtos/${product.id}`}
          className="grid h-8 w-8 place-items-center rounded-[9px] border border-border-strong text-muted transition-colors hover:border-accent hover:text-accent-hover"
          title="Editar"
        >
          <Pencil className="h-[13px] w-[13px]" />
        </Link>
        <button
          type="button"
          disabled={pending || product.orderedCount > 0}
          onClick={handleDelete}
          title={product.orderedCount > 0 ? "Já usado em pedidos — não pode ser excluído" : "Excluir"}
          className="grid h-8 w-8 place-items-center rounded-[9px] border border-border-strong text-muted transition-colors hover:border-crit hover:text-crit disabled:opacity-30"
        >
          <Trash2 className="h-[13px] w-[13px]" />
        </button>
      </div>
    </div>
  );
}
