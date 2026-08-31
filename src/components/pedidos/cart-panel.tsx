"use client";

import { Trash2, Plus, Minus, ShoppingBag } from "lucide-react";

import { formatBRL } from "@/lib/format";
import { cartItemTotal, cartSubtotal, type CartItem } from "@/lib/order-summary";

export function CartPanel({
  items,
  onChangeQuantity,
  onRemove,
}: {
  items: CartItem[];
  onChangeQuantity: (key: string, quantity: number) => void;
  onRemove: (key: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-[14px] border border-dashed border-border-strong py-8 text-center text-faint">
        <ShoppingBag className="h-5 w-5" />
        <span className="text-[13px]">Adicione itens do cardápio ao pedido</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <div key={item.key} className="flex flex-col gap-2 rounded-[13px] border border-border-soft p-3">
          <div className="flex items-start gap-2.5">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[13.5px] font-medium">{item.product.name}</span>
              {item.selectedOptions.length > 0 ? (
                <span className="text-[12px] text-faint">{item.selectedOptions.map((o) => o.name).join(", ")}</span>
              ) : null}
            </div>
            <span className="whitespace-nowrap text-[13.5px] font-semibold">{formatBRL(cartItemTotal(item))}</span>
            <button
              type="button"
              onClick={() => onRemove(item.key)}
              className="grid h-7 w-7 flex-none place-items-center rounded-[8px] text-faint transition-colors hover:bg-crit-bg hover:text-crit"
            >
              <Trash2 className="h-[14px] w-[14px]" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChangeQuantity(item.key, Math.max(1, item.quantity - 1))}
              className="grid h-7 w-7 place-items-center rounded-[7px] border border-border-strong text-muted hover:border-accent hover:text-accent-hover"
            >
              <Minus className="h-[13px] w-[13px]" />
            </button>
            <span className="w-4 text-center text-[13px] font-semibold">{item.quantity}</span>
            <button
              type="button"
              onClick={() => onChangeQuantity(item.key, item.quantity + 1)}
              className="grid h-7 w-7 place-items-center rounded-[7px] border border-border-strong text-muted hover:border-accent hover:text-accent-hover"
            >
              <Plus className="h-[13px] w-[13px]" />
            </button>
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between border-t border-border-soft pt-3 text-[13.5px]">
        <span className="text-muted">Subtotal</span>
        <span className="font-semibold">{formatBRL(cartSubtotal(items))}</span>
      </div>
    </div>
  );
}
