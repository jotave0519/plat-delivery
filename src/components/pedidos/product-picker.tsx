"use client";

import { useState } from "react";
import { Plus, Minus, ChevronDown, ChevronUp } from "lucide-react";

import { formatBRL } from "@/lib/format";
import type { CartItem } from "@/lib/order-summary";
import type { CatalogCategory, CatalogProduct } from "@/server/queries/orders";

function ProductRow({ product, onAdd }: { product: CatalogProduct; onAdd: (item: CartItem) => void }) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggleOption(groupMultiple: boolean, groupItemIds: string[], id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (groupMultiple) {
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
      } else {
        groupItemIds.forEach((otherId) => next.delete(otherId));
        if (!prev.has(id)) next.add(id);
      }
      return next;
    });
  }

  function reset() {
    setOpen(false);
    setQuantity(1);
    setSelectedIds(new Set());
  }

  function handleAdd() {
    const selectedOptions = product.optionGroups
      .flatMap((g) => g.items)
      .filter((i) => selectedIds.has(i.id))
      .map((i) => ({ id: i.id, name: i.name, price: i.price }));

    onAdd({
      key: crypto.randomUUID(),
      product: { id: product.id, name: product.name, price: product.price },
      quantity,
      selectedOptions,
      notes: "",
    });
    reset();
  }

  return (
    <div className="rounded-[14px] border border-border-soft">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[14px] font-medium">{product.name}</span>
          {product.description ? <span className="truncate text-[12px] text-faint">{product.description}</span> : null}
        </div>
        <span className="whitespace-nowrap text-[13.5px] font-semibold">{formatBRL(product.price)}</span>
        {open ? <ChevronUp className="h-4 w-4 text-faint" /> : <ChevronDown className="h-4 w-4 text-faint" />}
      </button>

      {open ? (
        <div className="flex flex-col gap-3 border-t border-border-soft px-3.5 py-3.5">
          {product.optionGroups.map((group) => (
            <div key={group.id} className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium uppercase tracking-[.04em] text-faint">
                {group.name}
                {group.required ? " · obrigatório" : ""}
              </span>
              <div className="flex flex-col gap-1">
                {group.items.map((item) => {
                  const checked = selectedIds.has(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        toggleOption(
                          group.multiple,
                          group.items.map((i) => i.id),
                          item.id,
                        )
                      }
                      className={`flex items-center justify-between rounded-[9px] border px-3 py-2 text-left text-[13px] transition-colors ${
                        checked ? "border-accent bg-accent-bg text-accent-hover" : "border-border-soft text-muted hover:border-border-strong"
                      }`}
                    >
                      <span>{item.name}</span>
                      <span className="text-[12px]">+{formatBRL(item.price)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="grid h-9 w-9 place-items-center rounded-[8px] border border-border-strong text-muted hover:border-accent hover:text-accent-hover"
              >
                <Minus className="h-[14px] w-[14px]" />
              </button>
              <span className="w-5 text-center text-[14px] font-semibold">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                className="grid h-9 w-9 place-items-center rounded-[8px] border border-border-strong text-muted hover:border-accent hover:text-accent-hover"
              >
                <Plus className="h-[14px] w-[14px]" />
              </button>
            </div>
            <button
              type="button"
              onClick={handleAdd}
              className="flex items-center gap-2 rounded-[10px] bg-charcoal px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover"
            >
              <Plus className="h-[14px] w-[14px]" />
              Adicionar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ProductPicker({ catalog, onAdd }: { catalog: CatalogCategory[]; onAdd: (item: CartItem) => void }) {
  const [activeCategory, setActiveCategory] = useState(catalog[0]?.id);

  if (catalog.length === 0) {
    return <p className="text-[13.5px] text-faint">Nenhum produto disponível no cardápio ainda.</p>;
  }

  const current = catalog.find((c) => c.id === activeCategory) ?? catalog[0];

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {catalog.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => setActiveCategory(category.id)}
            className={`flex-none rounded-[10px] px-3.5 py-2 text-[13px] font-medium transition-colors ${
              category.id === current.id ? "bg-charcoal text-white" : "bg-neutral-bg text-muted hover:text-ink"
            }`}
          >
            {category.name}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        {current.products.map((product) => (
          <ProductRow key={product.id} product={product} onAdd={onAdd} />
        ))}
      </div>
    </div>
  );
}
