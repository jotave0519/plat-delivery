import { notFound } from "next/navigation";
import Image from "next/image";
import { MapPin, Phone, StickyNote, Receipt } from "lucide-react";

import { getTenant } from "@/lib/tenant";
import { getOrderDetail } from "@/server/queries/orders";
import { confirmPayment } from "@/server/actions/orders";
import { FLOW, TONE_CLASSES, CHANNEL_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_IS_PAID } from "@/lib/order-flow";
import { formatBRL } from "@/lib/format";
import { OrderStatusHeader } from "@/components/pedidos/order-status-header";
import { ConfirmButton } from "@/components/ui/confirm-button";

function formatDateTime(date: Date) {
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default async function OrderDetailPage(props: PageProps<"/pedidos/[id]">) {
  const { id } = await props.params;
  const tenant = await getTenant();
  const order = await getOrderDetail(tenant.restaurantId, id);
  if (!order) notFound();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <OrderStatusHeader orderId={order.id} number={order.number} createdAt={order.createdAt} status={order.status} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-3 rounded-[20px] border border-border bg-surface p-5">
            <h2 className="text-[15px] font-semibold tracking-tight">Itens</h2>
            <div className="flex flex-col divide-y divide-border-soft">
              {order.items.map((item) => (
                <div key={item.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-[14px] font-medium">
                      {item.quantity}× {item.product.name}
                    </span>
                    <span className="ml-auto text-[14px] font-semibold">
                      {formatBRL(Number(item.unitPrice) * item.quantity)}
                    </span>
                  </div>
                  {item.options.length > 0 ? (
                    <span className="text-[12.5px] text-faint">{item.options.map((o) => o.optionItem.name).join(", ")}</span>
                  ) : null}
                  {item.notes ? <span className="text-[12.5px] text-warn-fg">{item.notes}</span> : null}
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1.5 border-t border-border-soft pt-3 text-[13.5px]">
              <div className="flex justify-between text-muted">
                <span>Subtotal</span>
                <span>{formatBRL(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Taxa de entrega</span>
                <span>{formatBRL(order.deliveryFee)}</span>
              </div>
              <div className="flex justify-between text-[15px] font-semibold">
                <span>Total</span>
                <span>{formatBRL(order.total)}</span>
              </div>
            </div>
          </section>

          {order.notes ? (
            <section className="flex items-start gap-2.5 rounded-[16px] bg-warn-bg px-4 py-3.5">
              <StickyNote className="mt-0.5 h-4 w-4 flex-none text-warn" />
              <span className="text-[13px] text-warn-fg">{order.notes}</span>
            </section>
          ) : null}

          <section className="flex flex-col gap-3 rounded-[20px] border border-border bg-surface p-5">
            <h2 className="text-[15px] font-semibold tracking-tight">Linha do tempo</h2>
            <div className="flex flex-col gap-3">
              {order.events.map((event) => {
                const eventFlow = FLOW[event.status];
                const eventTone = TONE_CLASSES[eventFlow.tone];
                const EventIcon = eventFlow.icon;
                return (
                  <div key={event.id} className="flex items-center gap-3">
                    <span className={`grid h-7 w-7 flex-none place-items-center rounded-full ${eventTone.bg}`}>
                      <EventIcon className={`h-[14px] w-[14px] ${eventTone.icon}`} />
                    </span>
                    <span className="text-[13.5px] font-medium">{eventFlow.chip}</span>
                    <span className="ml-auto text-[12.5px] text-faint">{formatDateTime(event.createdAt)}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-5">
          <section className="flex flex-col gap-3 rounded-[20px] border border-border bg-surface p-5">
            <h2 className="text-[15px] font-semibold tracking-tight">Cliente</h2>
            <div className="flex flex-col gap-1.5">
              <span className="text-[14px] font-medium">{order.customerNameOverride ?? order.customer?.name ?? "Cliente balcão"}</span>
              {order.customer?.phone ? (
                <span className="flex items-center gap-1.5 text-[13px] text-faint">
                  <Phone className="h-[13px] w-[13px]" />
                  {order.customer.phone}
                </span>
              ) : null}
              {order.address ? (
                <span className="flex items-start gap-1.5 text-[13px] text-faint">
                  <MapPin className="mt-0.5 h-[13px] w-[13px] flex-none" />
                  {order.address}
                </span>
              ) : null}
            </div>
          </section>

          <section className="flex flex-col gap-2.5 rounded-[20px] border border-border bg-surface p-5 text-[13.5px]">
            <h2 className="text-[15px] font-semibold tracking-tight">Detalhes</h2>
            <div className="flex justify-between text-muted">
              <span>Canal</span>
              <span className="font-medium text-ink">{CHANNEL_LABELS[order.channel] ?? order.channel}</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>Entrega</span>
              <span className="font-medium text-ink">{order.fulfillment === "DELIVERY" ? "Entrega" : "Retirada"}</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>Pagamento</span>
              <span className="font-medium text-ink">{PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>Status pgto.</span>
              <span className={`font-medium ${PAYMENT_STATUS_IS_PAID[order.paymentStatus] ? "text-ok-fg" : "text-warn-fg"}`}>
                {PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}
              </span>
            </div>
          </section>

          {order.paymentMethod === "PIX" && !PAYMENT_STATUS_IS_PAID[order.paymentStatus] ? (
            <section className="flex flex-col gap-3 rounded-[20px] border border-border bg-surface p-5">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
                <Receipt className="h-4 w-4 text-muted" />
                Comprovante Pix
              </h2>
              {order.pixProofBase64 ? (
                <Image
                  src={`data:${order.pixProofMimeType ?? "image/jpeg"};base64,${order.pixProofBase64}`}
                  alt="Comprovante de pagamento enviado pelo cliente"
                  width={600}
                  height={320}
                  unoptimized
                  className="max-h-[320px] w-full rounded-[13px] border border-border-soft object-contain"
                />
              ) : (
                <p className="text-[13px] text-faint">Aguardando o cliente enviar o comprovante pelo WhatsApp.</p>
              )}
              <ConfirmButton
                action={confirmPayment.bind(null, order.id)}
                confirmMessage="Confirmar que o pagamento deste pedido foi recebido?"
                label="Confirmar pagamento"
                className="flex items-center justify-center gap-2 rounded-[10px] bg-charcoal px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
              />
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
