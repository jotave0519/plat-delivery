"use client";

import Image from "next/image";
import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { Pencil, EyeOff, Eye, Trash2, ImageOff } from "lucide-react";

import { formatBRL } from "@/lib/format";
import { deleteProduct, toggleProductAvailability } from "@/server/actions/cardapio";
import type { CardapioProduct } from "@/server/queries/cardapio";
import { ConfirmButton } from "@/components/ui/confirm-button";

export function ProductCard({ product }: { product: CardapioProduct }) {
  const [pending, startTransition] = useTransition();
  // Same reasoning as OrderCard's optimistic status: a boolean flip with no
  // server-computed value involved, safe to reflect immediately.
  const [optimisticAvailable, setOptimisticAvailable] = useOptimistic(
    product.isAvailable,
    (_current, next: boolean) => next,
  );

  function handleToggle() {
    startTransition(async () => {
      setOptimisticAvailable(!optimisticAvailable);
      await toggleProductAvailability(product.id);
    });
  }

  return (
    <div
      className={`flex flex-col gap-3 rounded-[16px] border border-border-soft p-3.5 transition-opacity ${
        optimisticAvailable ? "" : "opacity-60"
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
          {!optimisticAvailable ? <span className="text-[11.5px] font-medium text-warn-fg">Pausado</span> : null}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={handleToggle}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-[9px] border border-border-strong py-1.5 text-[12.5px] font-medium text-muted transition-colors hover:border-accent hover:text-accent-hover disabled:opacity-50"
        >
          {optimisticAvailable ? <EyeOff className="h-[13px] w-[13px]" /> : <Eye className="h-[13px] w-[13px]" />}
          {optimisticAvailable ? "Pausar" : "Ativar"}
        </button>
        <Link
          href={`/cardapio/produtos/${product.id}`}
          className="grid h-8 w-8 place-items-center rounded-[9px] border border-border-strong text-muted transition-colors hover:border-accent hover:text-accent-hover"
          title="Editar"
        >
          <Pencil className="h-[13px] w-[13px]" />
        </Link>
        <ConfirmButton
          action={deleteProduct.bind(null, product.id)}
          confirmMessage={`Excluir "${product.name}"? Essa ação não pode ser desfeita.`}
          icon={<Trash2 className="h-[13px] w-[13px]" />}
          disabled={product.orderedCount > 0}
          title={product.orderedCount > 0 ? "Já usado em pedidos — não pode ser excluído" : "Excluir"}
          className="grid h-8 w-8 place-items-center rounded-[9px] border border-border-strong text-muted transition-colors hover:border-crit hover:text-crit disabled:opacity-30"
        />
      </div>
    </div>
  );
}
