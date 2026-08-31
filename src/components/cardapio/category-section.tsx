"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronUp, ChevronDown, Pencil, Trash2, Check, X, Plus } from "lucide-react";

import { deleteCategory, moveCategory, saveCategory } from "@/server/actions/cardapio";
import { ProductCard } from "@/components/cardapio/product-card";
import type { CardapioCategory } from "@/server/queries/cardapio";

export function CategorySection({
  category,
  isFirst,
  isLast,
}: {
  category: CardapioCategory;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(category.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleRenameSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    startTransition(async () => {
      const result = await saveCategory({ id: category.id, name: name.trim() });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setRenaming(false);
    });
  }

  function handleDelete() {
    if (!confirm(`Excluir a categoria "${category.name}"?`)) return;
    startTransition(async () => {
      const result = await deleteCategory(category.id);
      if (result?.error) alert(result.error);
    });
  }

  return (
    <section className="flex flex-col gap-3.5 rounded-[20px] border border-border bg-surface p-5">
      <div className="flex items-center gap-2.5">
        {renaming ? (
          <form onSubmit={handleRenameSubmit} className="flex flex-1 items-center gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 rounded-[9px] border border-border-strong px-2.5 py-1.5 text-[15px] font-semibold outline-none focus:border-accent"
            />
            <button type="submit" className="grid h-7 w-7 place-items-center rounded-[7px] text-ok-fg hover:bg-ok-bg">
              <Check className="h-[15px] w-[15px]" />
            </button>
            <button
              type="button"
              onClick={() => {
                setRenaming(false);
                setName(category.name);
              }}
              className="grid h-7 w-7 place-items-center rounded-[7px] text-faint hover:bg-neutral-bg"
            >
              <X className="h-[15px] w-[15px]" />
            </button>
          </form>
        ) : (
          <>
            <h2 className="text-[16px] font-semibold tracking-tight">{category.name}</h2>
            <span className="text-[12.5px] text-faint">
              {category.products.length} produto{category.products.length === 1 ? "" : "s"}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                disabled={isFirst || pending}
                onClick={() => startTransition(() => moveCategory(category.id, "up"))}
                className="grid h-7 w-7 place-items-center rounded-[7px] text-faint transition-colors hover:bg-neutral-bg hover:text-ink disabled:opacity-30"
              >
                <ChevronUp className="h-[15px] w-[15px]" />
              </button>
              <button
                type="button"
                disabled={isLast || pending}
                onClick={() => startTransition(() => moveCategory(category.id, "down"))}
                className="grid h-7 w-7 place-items-center rounded-[7px] text-faint transition-colors hover:bg-neutral-bg hover:text-ink disabled:opacity-30"
              >
                <ChevronDown className="h-[15px] w-[15px]" />
              </button>
              <button
                type="button"
                onClick={() => setRenaming(true)}
                className="grid h-7 w-7 place-items-center rounded-[7px] text-faint transition-colors hover:bg-neutral-bg hover:text-ink"
              >
                <Pencil className="h-[13px] w-[13px]" />
              </button>
              <button
                type="button"
                disabled={category.products.length > 0}
                title={category.products.length > 0 ? "Só categorias vazias podem ser excluídas" : "Excluir"}
                onClick={handleDelete}
                className="grid h-7 w-7 place-items-center rounded-[7px] text-faint transition-colors hover:bg-crit-bg hover:text-crit disabled:opacity-30"
              >
                <Trash2 className="h-[13px] w-[13px]" />
              </button>
            </div>
          </>
        )}
      </div>

      {error ? <p className="text-[12.5px] text-crit-fg">{error}</p> : null}

      {category.products.length === 0 ? (
        <Link
          href={`/cardapio/produtos/novo?categoria=${category.id}`}
          className="flex items-center justify-center gap-2 rounded-[13px] border border-dashed border-border-strong py-6 text-[13px] font-medium text-faint transition-colors hover:border-accent hover:text-accent-hover"
        >
          <Plus className="h-[15px] w-[15px]" />
          Adicionar o primeiro produto desta categoria
        </Link>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {category.products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </section>
  );
}
