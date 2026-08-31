"use client";

import { useState, useTransition } from "react";

import { formatBRL } from "@/lib/format";
import { cartSubtotal, type CartItem } from "@/lib/order-summary";
import { createManualOrder } from "@/server/actions/orders";
import type { CatalogCategory } from "@/server/queries/orders";
import { CartPanel } from "@/components/pedidos/cart-panel";
import { CustomerPicker, type SelectedCustomer } from "@/components/pedidos/customer-picker";
import { ProductPicker } from "@/components/pedidos/product-picker";

type Fulfillment = "DELIVERY" | "RETIRADA";
type Channel = "TELEFONE" | "BALCAO";
type PaymentMethod = "PIX" | "CARTAO" | "DINHEIRO" | "VALE_REFEICAO";

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "PIX", label: "Pix" },
  { value: "CARTAO", label: "Cartão" },
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "VALE_REFEICAO", label: "Vale-refeição" },
];

const segClass = (active: boolean) =>
  `flex-1 rounded-[8px] py-1.5 text-[12.5px] font-medium transition-colors ${
    active ? "bg-surface text-ink shadow-[0_1px_2px_rgba(26,29,35,.08)]" : "text-muted"
  }`;

const textareaClass =
  "resize-none rounded-[11px] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent";

export function NewOrderForm({ catalog }: { catalog: CatalogCategory[] }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<SelectedCustomer | null>(null);
  const [fulfillment, setFulfillment] = useState<Fulfillment>("DELIVERY");
  const [address, setAddress] = useState("");
  const [deliveryFee, setDeliveryFee] = useState(6.9);
  const [channel, setChannel] = useState<Channel>("TELEFONE");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("PIX");
  const [paymentStatus, setPaymentStatus] = useState<"PENDENTE" | "PAGO">("PENDENTE");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Prefill the delivery address from the selected customer's last known
  // address, without clobbering something the attendant already typed.
  function handleCustomerChange(next: SelectedCustomer | null) {
    setCustomer(next);
    if (fulfillment === "DELIVERY" && next?.address && !address) {
      setAddress(next.address);
    }
  }

  const subtotal = cartSubtotal(cart);
  const total = subtotal + (fulfillment === "DELIVERY" ? deliveryFee : 0);

  function handleSubmit() {
    setError(null);
    if (!customer) {
      setError("Selecione ou cadastre um cliente.");
      return;
    }
    if (cart.length === 0) {
      setError("Adicione pelo menos um item ao pedido.");
      return;
    }
    if (fulfillment === "DELIVERY" && !address.trim()) {
      setError("Informe o endereço de entrega.");
      return;
    }

    startTransition(async () => {
      const result = await createManualOrder({
        customer: customer.id ? { id: customer.id } : { name: customer.name, phone: customer.phone },
        channel,
        fulfillment,
        address: fulfillment === "DELIVERY" ? address : undefined,
        paymentMethod,
        paymentStatus,
        deliveryFee,
        notes: notes || undefined,
        items: cart.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          optionItemIds: item.selectedOptions.map((o) => o.id),
        })),
      });
      // On success createManualOrder redirects and this line never runs.
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
      <section className="flex flex-col gap-4 rounded-[20px] border border-border bg-surface p-5">
        <h2 className="text-[15px] font-semibold tracking-tight">Itens do pedido</h2>
        <ProductPicker catalog={catalog} onAdd={(item) => setCart((c) => [...c, item])} />
      </section>

      <aside className="flex flex-col gap-5">
        <section className="flex flex-col gap-3 rounded-[20px] border border-border bg-surface p-5">
          <h2 className="text-[15px] font-semibold tracking-tight">Cliente</h2>
          <CustomerPicker value={customer} onChange={handleCustomerChange} />
        </section>

        <section className="flex flex-col gap-3 rounded-[20px] border border-border bg-surface p-5">
          <h2 className="text-[15px] font-semibold tracking-tight">Carrinho</h2>
          <CartPanel
            items={cart}
            onChangeQuantity={(key, quantity) =>
              setCart((c) => c.map((i) => (i.key === key ? { ...i, quantity } : i)))
            }
            onRemove={(key) => setCart((c) => c.filter((i) => i.key !== key))}
          />
        </section>

        <section className="flex flex-col gap-3.5 rounded-[20px] border border-border bg-surface p-5">
          <h2 className="text-[15px] font-semibold tracking-tight">Entrega e pagamento</h2>

          <div className="flex rounded-[10px] bg-neutral-bg p-1">
            <button type="button" onClick={() => setFulfillment("DELIVERY")} className={segClass(fulfillment === "DELIVERY")}>
              Entrega
            </button>
            <button type="button" onClick={() => setFulfillment("RETIRADA")} className={segClass(fulfillment === "RETIRADA")}>
              Retirada
            </button>
          </div>

          {fulfillment === "DELIVERY" ? (
            <>
              <textarea
                className={textareaClass}
                placeholder="Endereço de entrega"
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
              <label className="flex items-center justify-between text-[13px] text-muted">
                Taxa de entrega
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(Math.max(0, Number(e.target.value) || 0))}
                  className="w-24 rounded-[8px] border border-border-strong px-2 py-1 text-right text-[13px] outline-none focus:border-accent"
                />
              </label>
            </>
          ) : null}

          <div className="flex rounded-[10px] bg-neutral-bg p-1">
            <button type="button" onClick={() => setChannel("TELEFONE")} className={segClass(channel === "TELEFONE")}>
              Telefone
            </button>
            <button type="button" onClick={() => setChannel("BALCAO")} className={segClass(channel === "BALCAO")}>
              Balcão
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setPaymentMethod(m.value)}
                className={`rounded-[9px] px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                  paymentMethod === m.value ? "bg-charcoal text-white" : "bg-neutral-bg text-muted"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex rounded-[10px] bg-neutral-bg p-1">
            <button type="button" onClick={() => setPaymentStatus("PENDENTE")} className={segClass(paymentStatus === "PENDENTE")}>
              Pendente
            </button>
            <button type="button" onClick={() => setPaymentStatus("PAGO")} className={segClass(paymentStatus === "PAGO")}>
              Pago
            </button>
          </div>

          <textarea
            className={textareaClass}
            placeholder="Observações do pedido (opcional)"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </section>

        {error ? <p className="rounded-[10px] bg-crit-bg px-3 py-2 text-[13px] text-crit-fg">{error}</p> : null}

        <div className="flex flex-col gap-2 rounded-[20px] bg-charcoal p-5 text-white">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] text-[#8E95A6]">Total</span>
            <span className="text-[22px] font-semibold">{formatBRL(total)}</span>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={handleSubmit}
            className="mt-1 flex min-h-[46px] items-center justify-center rounded-[11px] bg-accent text-[14px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {pending ? "Criando…" : "Criar pedido"}
          </button>
        </div>
      </aside>
    </div>
  );
}
