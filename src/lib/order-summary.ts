type ItemLike = { quantity: number; product: { name: string } };

/** "2× Burger Duplo · Batata Rústica" — how order cards show their contents. */
export function summarizeItems(items: ItemLike[]) {
  return items
    .map((it) => (it.quantity > 1 ? `${it.quantity}× ${it.product.name}` : it.product.name))
    .join(" · ");
}

/** One line of the cart being built in the manual order creation form. */
export type CartItem = {
  key: string;
  product: { id: string; name: string; price: number };
  quantity: number;
  selectedOptions: { id: string; name: string; price: number }[];
  notes: string;
};

/** Live total shown in the UI as the attendant builds the cart. The server
 * action re-derives this from the database instead of trusting it (see
 * createManualOrder in src/server/actions/orders.ts) — this is only for the
 * on-screen preview. */
export function cartItemTotal(item: CartItem) {
  const optionsTotal = item.selectedOptions.reduce((sum, o) => sum + o.price, 0);
  return (item.product.price + optionsTotal) * item.quantity;
}

export function cartSubtotal(items: CartItem[]) {
  return items.reduce((sum, item) => sum + cartItemTotal(item), 0);
}
